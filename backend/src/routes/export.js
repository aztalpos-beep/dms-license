const express = require('express');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function formatDate(val) {
  if (!val) return '';
  return typeof val === 'string' ? val.slice(0, 10) : val.toISOString().slice(0, 10);
}

function computeDateRange(period, anchor) {
  const d = new Date(anchor || new Date().toISOString().slice(0, 10));
  const pad = (n) => String(n).padStart(2, '0');
  const toStr = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

  if (period === 'daily') return { start: toStr(d), end: toStr(d) };
  if (period === 'weekly') {
    const start = new Date(d); start.setDate(start.getDate() - 6);
    return { start: toStr(start), end: toStr(d) };
  }
  if (period === 'yearly') {
    return { start: `${d.getFullYear()}-01-01`, end: `${d.getFullYear()}-12-31` };
  }
  // monthly (default)
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: toStr(start), end: toStr(end) };
}

function getBranchId(req) {
  return req.user.role === 'super_admin'
    ? (req.query.branch_id ? Number(req.query.branch_id) : null)
    : req.user.branchId;
}

async function fetchReportData(reportType, branchId, start, end) {
  if (reportType === 'profit') {
    const params = branchId ? [branchId, start, end] : [start, end];
    const bClause = branchId ? 's.branch_id = $1 AND ' : '';
    const idx = branchId ? 2 : 1;
    const result = await pool.query(
      `SELECT s.receipt_no, s.sale_date, s.total_amount, br.name AS branch_name,
              STRING_AGG(DISTINCT i.title, ', ') AS product_name,
              COALESCE(SUM(si.quantity * i.purchase_price), 0) AS total_cost,
              s.total_amount - COALESCE(SUM(si.quantity * i.purchase_price), 0) AS profit,
              (SELECT COUNT(*) FROM sale_payment_plan p WHERE p.sale_id = s.id) AS installment_count
       FROM sales s
       JOIN branches br ON br.id = s.branch_id
       JOIN sale_items si ON si.sale_id = s.id
       JOIN inventory_items i ON i.id = si.inventory_item_id
       WHERE ${bClause}s.sale_date BETWEEN $${idx} AND $${idx + 1} AND s.status != 'returned'
       GROUP BY s.id, br.name ORDER BY s.sale_date`,
      params
    );
    return {
      title: 'Net Profit Report',
      columns: ['Receipt', 'Product', 'Branch', 'Sale Type', 'Date', 'Total', 'Cost', 'Profit'],
      rows: result.rows.map((r) => [
        r.receipt_no, r.product_name || '—', r.branch_name, formatDate(r.sale_date),
        Number(r.installment_count) > 0 ? `Installment (${r.installment_count})` : 'Net Sale',
        Number(r.total_amount), Number(r.total_cost), Number(r.profit),
      ]),
    };
  }

  if (reportType === 'receivables') {
    const params = branchId ? [branchId] : [];
    const result = await pool.query(
      `SELECT s.receipt_no, c.name, c.mobile_no, s.outstanding_balance
       FROM sales s JOIN customers c ON c.id = s.customer_id
       WHERE s.outstanding_balance > 0 AND s.status = 'active' ${branchId ? 'AND s.branch_id = $1' : ''}
       ORDER BY s.outstanding_balance DESC`,
      params
    );
    return {
      title: 'Outstanding Receivables Report',
      columns: ['Receipt', 'Customer', 'Mobile', 'Outstanding'],
      rows: result.rows.map((r) => [r.receipt_no, r.name, r.mobile_no || '—', Number(r.outstanding_balance)]),
    };
  }

  if (reportType === 'valuation') {
    const params = branchId ? [branchId] : [];
    const result = await pool.query(
      `SELECT item_type, COUNT(*) AS item_count, COALESCE(SUM(purchase_price), 0) AS total_value
       FROM inventory_items WHERE status = 'in_stock' ${branchId ? 'AND branch_id = $1' : ''} GROUP BY item_type`,
      params
    );
    return {
      title: 'Inventory Valuation Report',
      columns: ['Item Type', 'Count', 'Total Value'],
      rows: result.rows.map((r) => [r.item_type, Number(r.item_count), Number(r.total_value)]),
    };
  }

  if (reportType === 'cashflow') {
    const params = branchId ? [branchId, start, end] : [start, end];
    const idx = branchId ? 2 : 1;
    const result = await pool.query(
      `SELECT ledger_date, opening_cash, cash_in_sales, cash_in_recovery, cash_in_other, cash_out_expenses, cash_out_refunds, closing_cash
       FROM daily_cashbook WHERE ${branchId ? 'branch_id = $1 AND ' : ''}ledger_date BETWEEN $${idx} AND $${idx + 1}
       ORDER BY ledger_date`,
      params
    );
    return {
      title: 'Cash Flow Report',
      columns: ['Date', 'Opening', 'Cash In', 'Cash Out', 'Closing'],
      rows: result.rows.map((r) => [
        formatDate(r.ledger_date),
        Number(r.opening_cash),
        Number(r.cash_in_sales) + Number(r.cash_in_recovery) + Number(r.cash_in_other),
        Number(r.cash_out_expenses) + Number(r.cash_out_refunds),
        Number(r.closing_cash),
      ]),
    };
  }

  if (reportType === 'branch_summary') {
    const result = await pool.query(
      `WITH sale_profits AS (
         SELECT s.id, s.branch_id, s.total_amount,
                COALESCE(SUM(si.quantity * i.purchase_price), 0) AS cost
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         JOIN inventory_items i ON i.id = si.inventory_item_id
         WHERE s.sale_date BETWEEN $1 AND $2 AND s.status != 'returned'
         GROUP BY s.id
       ),
       branch_profit AS (
         SELECT branch_id, COUNT(*) AS sales_count, COALESCE(SUM(total_amount - cost), 0) AS gross_profit
         FROM sale_profits
         GROUP BY branch_id
       ),
       branch_expenses AS (
         SELECT branch_id, COALESCE(SUM(amount), 0) AS total_expenses
         FROM expenses
         WHERE status = 'approved' AND expense_date BETWEEN $1 AND $2
         GROUP BY branch_id
       )
       SELECT b.name AS branch_name,
              COALESCE(bp.sales_count, 0) AS sales_count,
              COALESCE(bp.gross_profit, 0) AS gross_profit,
              COALESCE(be.total_expenses, 0) AS total_expenses,
              COALESCE(bp.gross_profit, 0) - COALESCE(be.total_expenses, 0) AS net_profit
       FROM branches b
       LEFT JOIN branch_profit bp ON bp.branch_id = b.id
       LEFT JOIN branch_expenses be ON be.branch_id = b.id
       ORDER BY b.id`,
      [start, end]
    );
    return {
      title: 'Branch-wise Profit & Expense Summary',
      columns: ['Branch', 'Sales Count', 'Sales Profit', 'Total Expenses', 'Net Profit'],
      rows: result.rows.map((r) => [
        r.branch_name, Number(r.sales_count), Number(r.gross_profit), Number(r.total_expenses), Number(r.net_profit),
      ]),
    };
  }

  if (reportType === 'vendors') {
    const params = branchId ? [branchId, start, end] : [start, end];
    const idx = branchId ? 2 : 1;
    const result = await pool.query(
      `SELECT v.name, COUNT(i.id) AS item_count, COALESCE(SUM(i.purchase_price), 0) AS total_purchased
       FROM vendors v
       LEFT JOIN inventory_items i ON i.vendor_id = v.id
         AND i.purchase_date BETWEEN $${idx} AND $${idx + 1}
         ${branchId ? 'AND i.branch_id = $1' : ''}
       GROUP BY v.id ORDER BY total_purchased DESC`,
      params
    );
    return {
      title: 'Vendor Purchases Report',
      columns: ['Vendor', 'Items', 'Total Purchased'],
      rows: result.rows.map((r) => [r.name, Number(r.item_count), Number(r.total_purchased)]),
    };
  }

  throw Object.assign(new Error('Unknown report type.'), { status: 400 });
}

// GET /api/export?report=profit|receivables|valuation|cashflow|vendors|branch_summary
//                &format=pdf|xlsx&period=daily|weekly|monthly|yearly&date=YYYY-MM-DD&branch_id=
router.get('/', async (req, res) => {
  try {
    const { report, format, period, date } = req.query;

    if (report === 'branch_summary' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can access the branch summary report.' });
    }

    const branchId = getBranchId(req);
    const { start, end } = computeDateRange(period, date);

    let branchName = 'All Branches';
    if (branchId) {
      const branchResult = await pool.query('SELECT name FROM branches WHERE id = $1', [branchId]);
      branchName = branchResult.rows[0]?.name || 'Unknown Branch';
    }

    const data = await fetchReportData(report, branchId, start, end);
    const filename = `${report}-${period || 'monthly'}-${start}_to_${end}`;

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(data.title.slice(0, 30));
      sheet.addRow([branchName]).font = { bold: true };
      sheet.addRow([data.title]);
      sheet.addRow([]);
      sheet.addRow(data.columns).font = { bold: true };
      data.rows.forEach((row) => sheet.addRow(row));
      sheet.columns.forEach((col) => { col.width = 20; });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    // Default: PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    doc.pipe(res);

    doc.fontSize(18).fillColor('#0B1E3D').text(branchName, { continued: false });
    doc.fontSize(13).fillColor('#59606C').text(data.title);
    doc.fontSize(9).text(`Period: ${start} to ${end}`);
    doc.moveDown();

    const colWidth = 495 / data.columns.length;
    let y = doc.y;
    doc.fontSize(9).fillColor('#fff');
    doc.rect(40, y, 495, 18).fill('#0B1E3D');
    data.columns.forEach((col, i) => {
      doc.fillColor('#fff').text(col, 44 + i * colWidth, y + 5, { width: colWidth - 8 });
    });
    y += 18;

    doc.fontSize(9);
    data.rows.forEach((row, rowIdx) => {
      if (y > 760) { doc.addPage(); y = 40; }
      if (rowIdx % 2 === 1) doc.rect(40, y, 495, 16).fill('#F2F3F5');
      row.forEach((cell, i) => {
        const text = typeof cell === 'number' ? cell.toLocaleString() : String(cell);
        doc.fillColor('#14181F').text(text, 44 + i * colWidth, y + 4, { width: colWidth - 8 });
      });
      y += 16;
    });

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(err.status || 500).json({ error: err.message || 'Could not generate export.' });
    }
  }
});

module.exports = router;
