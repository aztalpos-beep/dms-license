const express = require('express');
const ExcelJS = require('exceljs');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function formatDate(val) {
  if (!val) return '';
  return typeof val === 'string' ? val.slice(0, 10) : val.toISOString().slice(0, 10);
}

function resolveBranchId(req, providedBranchId) {
  if (req.user.role === 'super_admin') {
    if (!providedBranchId) {
      throw Object.assign(new Error('branch_id is required for super_admin requests.'), { status: 400 });
    }
    return Number(providedBranchId);
  }
  return req.user.branchId;
}

router.get('/', async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;

    const conditions = [];
    const params = [];
    if (branchId) { params.push(branchId); conditions.push(`branch_id = $${params.length}`); }
    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      conditions.push(`(name ILIKE $${params.length} OR mobile_no ILIKE $${params.length} OR nic ILIKE $${params.length})`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT c.*,
              COALESCE(SUM(CASE WHEN l.entry_type = 'debit' THEN l.amount ELSE -l.amount END), 0) AS outstanding_balance
       FROM customers c
       LEFT JOIN customer_ledger l ON l.customer_id = c.id
       ${whereClause}
       GROUP BY c.id
       ORDER BY c.name ASC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load customers.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    const { name, father_name, nic, address, mobile_no, picture_url, referred_by } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required.' });

    const result = await pool.query(
      `INSERT INTO customers (name, father_name, nic, address, mobile_no, picture_url, referred_by, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, father_name || null, nic || null, address || null, mobile_no || null, picture_url || null, referred_by || null, branchId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    const status = err.status || 500;
    console.error(err);
    res.status(status).json({ error: err.message || 'Could not create customer.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (customerResult.rows.length === 0) return res.status(404).json({ error: 'Customer not found.' });
    const customer = customerResult.rows[0];

    if (req.user.role !== 'super_admin' && customer.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this customer.' });
    }

    const ledgerResult = await pool.query(
      `SELECT l.*, s.receipt_no
       FROM customer_ledger l
       LEFT JOIN sales s ON s.id = l.sale_id
       WHERE l.customer_id = $1 ORDER BY l.entry_date DESC, l.id DESC`,
      [req.params.id]
    );

    const outstandingBalance = ledgerResult.rows.reduce((sum, entry) => {
      const amt = Number(entry.amount);
      return sum + (entry.entry_type === 'debit' ? amt : -amt);
    }, 0);

    res.json({ ...customer, ledger: ledgerResult.rows, outstanding_balance: outstandingBalance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load customer.' });
  }
});

router.put('/:id', requireRole('super_admin', 'admin', 'manager', 'sales_staff'), async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Customer not found.' });
    const customer = existing.rows[0];

    if (req.user.role !== 'super_admin' && customer.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this customer.' });
    }

    const { name, father_name, nic, address, mobile_no, picture_url, referred_by } = req.body;
    await pool.query(
      `UPDATE customers
       SET name = COALESCE($1, name), father_name = COALESCE($2, father_name), nic = COALESCE($3, nic),
           address = COALESCE($4, address), mobile_no = COALESCE($5, mobile_no),
           picture_url = COALESCE($6, picture_url), referred_by = COALESCE($7, referred_by)
       WHERE id = $8`,
      [name, father_name, nic, address, mobile_no, picture_url, referred_by, req.params.id]
    );
    res.json({ message: 'Customer updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update customer.' });
  }
});

// POST /api/customers/:id/ledger  (manual entry — amount must be positive;
// negative numbers are rejected so balances can never be corrupted by typos)
router.post('/:id/ledger', requireRole('super_admin', 'admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (customerResult.rows.length === 0) return res.status(404).json({ error: 'Customer not found.' });
    const customer = customerResult.rows[0];

    if (req.user.role !== 'super_admin' && customer.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this customer.' });
    }

    const { entry_type, amount, description, entry_date } = req.body;

    if (!['debit', 'credit'].includes(entry_type)) {
      return res.status(400).json({ error: 'entry_type must be debit or credit.' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number.' });
    }

    const result = await pool.query(
      `INSERT INTO customer_ledger (customer_id, entry_type, amount, description, entry_date)
       VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE)) RETURNING *`,
      [req.params.id, entry_type, amount, description || null, entry_date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not add ledger entry.' });
  }
});

router.delete('/:id/ledger/:entryId', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (customerResult.rows.length === 0) return res.status(404).json({ error: 'Customer not found.' });
    const customer = customerResult.rows[0];
    if (req.user.role !== 'super_admin' && customer.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this customer.' });
    }

    const entryResult = await pool.query(
      'SELECT * FROM customer_ledger WHERE id = $1 AND customer_id = $2',
      [req.params.entryId, req.params.id]
    );
    if (entryResult.rows.length === 0) return res.status(404).json({ error: 'Ledger entry not found.' });
    const entry = entryResult.rows[0];
    if (entry.sale_id !== null) {
      return res.status(400).json({ error: 'This entry is linked to a sale and cannot be deleted directly. Use Return/Cancel Sale instead.' });
    }

    await pool.query('DELETE FROM customer_ledger WHERE id = $1', [req.params.entryId]);
    res.json({ message: 'Ledger entry deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete ledger entry.' });
  }
});

// GET /api/customers/:id/statement
// One-page PDF ledger statement — total charged, total collected, net
// balance, and the full transaction history with a running balance.
// Meant to be printed or shared directly with the customer (e.g. WhatsApp).
router.get('/:id/statement', async (req, res) => {
  try {
    const customerResult = await pool.query(
      `SELECT c.*, b.name AS branch_name, b.address AS branch_address, b.phone AS branch_phone
       FROM customers c
       LEFT JOIN branches b ON b.id = c.branch_id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (customerResult.rows.length === 0) return res.status(404).json({ error: 'Customer not found.' });
    const customer = customerResult.rows[0];

    if (req.user.role !== 'super_admin' && customer.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this customer.' });
    }

    const ledgerResult = await pool.query(
      `SELECT l.*, s.receipt_no
       FROM customer_ledger l
       LEFT JOIN sales s ON s.id = l.sale_id
       WHERE l.customer_id = $1
       ORDER BY l.entry_date ASC, l.id ASC`,
      [req.params.id]
    );

    let totalDebit = 0;
    let totalCredit = 0;
    let runningBalance = 0;
    const rows = ledgerResult.rows.map((entry) => {
      const amt = Number(entry.amount);
      if (entry.entry_type === 'debit') { totalDebit += amt; runningBalance += amt; }
      else { totalCredit += amt; runningBalance -= amt; }
      return {
        date: entry.entry_date,
        details: entry.description || (entry.entry_type === 'debit' ? 'Charge added' : 'Payment received'),
        reference: entry.receipt_no || (entry.sale_id ? `Sale #${entry.sale_id}` : '—'),
        amount: entry.entry_type === 'debit' ? amt : -amt,
        balance: runningBalance,
      };
    });

    const safeName = (customer.name || 'customer').replace(/[^a-z0-9]+/gi, '_');
    const periodLabel = rows.length > 0 ? `${formatDate(rows[0].date)}  to  ${formatDate(rows[rows.length - 1].date)}` : '—';

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Customer Ledger', { pageSetup: { fitToPage: true, fitToWidth: 1 } });
    sheet.columns = [
      { width: 6 },   // NO
      { width: 14 },  // DATE
      { width: 46 },  // DESCRIPTION
      { width: 16 },  // DEBIT
      { width: 16 },  // CREDIT
    ];

    const YELLOW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6C93B' } };
    const YELLOW_PALE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCEBAE' } };
    const RED = { argb: 'FFC14545' };
    const GREEN = { argb: 'FF1A8F4C' };
    const INK = { argb: 'FF1A1A1A' };
    const thinGrid = { style: 'thin', color: { argb: 'FFB8B8B8' } };
    const boxBorder = { top: thinGrid, left: thinGrid, bottom: thinGrid, right: thinGrid };

    // ---- Title band ----
    sheet.mergeCells('A1:C2');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'CUSTOMER LEDGER';
    titleCell.font = { name: 'Calibri', size: 20, bold: true, color: INK };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.mergeCells('D1:E2');
    const periodCell = sheet.getCell('D1');
    periodCell.value = `Statement Period: ${periodLabel}`;
    periodCell.font = { name: 'Calibri', size: 10, bold: true, color: INK };
    periodCell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
    ['A1', 'B1', 'C1', 'D1', 'E1', 'A2', 'B2', 'C2', 'D2', 'E2'].forEach((addr) => {
      sheet.getCell(addr).fill = YELLOW;
    });
    sheet.getRow(1).height = 22;
    sheet.getRow(2).height = 18;

    sheet.getCell('A3').value = customer.branch_name || 'Yazman Motors';
    sheet.getCell('A3').font = { size: 9, italic: true, color: { argb: 'FF5B5B5B' } };

    // ---- Customer info ----
    sheet.getCell('A5').value = customer.name;
    sheet.getCell('A5').font = { bold: true, size: 12 };
    const infoBits = [];
    if (customer.father_name) infoBits.push(`S/O ${customer.father_name}`);
    if (customer.mobile_no) infoBits.push(customer.mobile_no);
    if (customer.nic) infoBits.push(`NIC ${customer.nic}`);
    if (customer.address) infoBits.push(customer.address);
    sheet.mergeCells('A6:E6');
    sheet.getCell('A6').value = infoBits.join('   ·   ');
    sheet.getCell('A6').font = { size: 9.5, color: { argb: 'FF5B5B5B' } };
    sheet.getCell('A7').value = `Generated: ${formatDate(new Date())}`;
    sheet.getCell('A7').font = { size: 8.5, color: { argb: 'FF5B5B5B' } };

    // ---- Table header ----
    const headerRowIdx = 9;
    const headerRow = sheet.getRow(headerRowIdx);
    headerRow.values = ['NO', 'DATE', 'DESCRIPTION', 'DEBIT', 'CREDIT'];
    headerRow.eachCell((cell) => {
      cell.fill = YELLOW;
      cell.font = { bold: true, size: 10, color: INK };
      cell.border = boxBorder;
      cell.alignment = { vertical: 'middle' };
    });
    headerRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
    headerRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };

    // ---- Data rows ----
    let r = headerRowIdx + 1;
    if (rows.length === 0) {
      sheet.mergeCells(`A${r}:E${r}`);
      const cell = sheet.getCell(`A${r}`);
      cell.value = 'No ledger entries yet.';
      cell.font = { italic: true, size: 9.5, color: { argb: 'FF5B5B5B' } };
      cell.border = boxBorder;
      r += 1;
    } else {
      rows.forEach((entry, idx) => {
        const row = sheet.getRow(r);
        const description = entry.reference && entry.reference !== '—' ? `${entry.reference} — ${entry.details}` : entry.details;
        row.getCell(1).value = idx + 1;
        row.getCell(1).alignment = { horizontal: 'center' };
        row.getCell(2).value = formatDate(entry.date);
        row.getCell(3).value = description;
        if (entry.amount >= 0) {
          row.getCell(4).value = entry.amount;
          row.getCell(4).font = { color: RED };
        } else {
          row.getCell(5).value = Math.abs(entry.amount);
          row.getCell(5).font = { color: GREEN };
        }
        row.getCell(4).numFmt = '#,##0';
        row.getCell(5).numFmt = '#,##0';
        row.getCell(4).alignment = { horizontal: 'right' };
        row.getCell(5).alignment = { horizontal: 'right' };
        row.eachCell({ includeEmpty: true }, (cell) => { cell.border = boxBorder; });
        r += 1;
      });
    }

    // ---- TOTALS row ----
    sheet.mergeCells(`A${r}:C${r}`);
    const totalsLabelCell = sheet.getCell(`A${r}`);
    totalsLabelCell.value = 'TOTALS:';
    totalsLabelCell.font = { bold: true, size: 10 };
    totalsLabelCell.alignment = { horizontal: 'right' };
    totalsLabelCell.border = boxBorder;
    const totalDebitCell = sheet.getCell(`D${r}`);
    totalDebitCell.value = totalDebit;
    totalDebitCell.numFmt = '#,##0';
    totalDebitCell.font = { bold: true, color: RED };
    totalDebitCell.alignment = { horizontal: 'right' };
    totalDebitCell.fill = YELLOW_PALE;
    totalDebitCell.border = boxBorder;
    const totalCreditCell = sheet.getCell(`E${r}`);
    totalCreditCell.value = totalCredit;
    totalCreditCell.numFmt = '#,##0';
    totalCreditCell.font = { bold: true, color: GREEN };
    totalCreditCell.alignment = { horizontal: 'right' };
    totalCreditCell.fill = YELLOW_PALE;
    totalCreditCell.border = boxBorder;
    r += 2;

    // ---- BALANCE row ----
    sheet.mergeCells(`A${r}:C${r}`);
    const balanceLabelCell = sheet.getCell(`A${r}`);
    balanceLabelCell.value = 'BALANCE OWED:';
    balanceLabelCell.font = { bold: true, size: 13 };
    balanceLabelCell.alignment = { vertical: 'middle' };
    sheet.mergeCells(`D${r}:E${r}`);
    const balanceValueCell = sheet.getCell(`D${r}`);
    balanceValueCell.value = runningBalance;
    balanceValueCell.numFmt = '#,##0';
    balanceValueCell.font = { bold: true, size: 14, color: runningBalance > 0 ? RED : GREEN };
    balanceValueCell.alignment = { horizontal: 'right', vertical: 'middle' };
    ['A', 'B', 'C', 'D', 'E'].forEach((col) => { sheet.getCell(`${col}${r}`).fill = YELLOW; });
    sheet.getRow(r).height = 24;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${safeName}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Could not generate statement.' });
    }
  }
});

module.exports = router;
