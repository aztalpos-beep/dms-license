const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendDeletionAlert } = require('../utils/mailer');

const router = express.Router();
router.use(requireAuth);

function resolveBranchId(req, providedBranchId) {
  if (req.user.role === 'super_admin') {
    if (!providedBranchId) {
      throw Object.assign(new Error('branch_id is required for super_admin requests.'), { status: 400 });
    }
    return Number(providedBranchId);
  }
  return req.user.branchId;
}

async function computeAutoTotals(branchId, date) {
  const salesResult = await pool.query(
    `SELECT COALESCE(SUM(advance_received), 0) AS total FROM sales WHERE branch_id = $1 AND sale_date = $2`,
    [branchId, date]
  );
  const recoveryResult = await pool.query(
    `SELECT COALESCE(SUM(sp.amount_received), 0) AS total
     FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
     WHERE s.branch_id = $1 AND sp.payment_date = $2`,
    [branchId, date]
  );
  const expensesResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE branch_id = $1 AND expense_date = $2 AND status = 'approved'`,
    [branchId, date]
  );
  const refundsResult = await pool.query(
    `SELECT COALESCE(SUM(r.refund_amount), 0) AS total
     FROM returns r JOIN sales s ON s.id = r.sale_id
     WHERE s.branch_id = $1 AND r.return_date = $2`,
    [branchId, date]
  );

  return {
    cash_in_sales: Number(salesResult.rows[0].total),
    cash_in_recovery: Number(recoveryResult.rows[0].total),
    cash_out_expenses: Number(expensesResult.rows[0].total),
    cash_out_refunds: Number(refundsResult.rows[0].total),
  };
}

// Voucher-number prefixes matching the Roznamcha template (RCV/PAY on the
// Credit side, EXP/REF on the Debit side). The app has no dedicated voucher
// field, so these are synthesized from each record's own id.
function voucherNumber(prefix, id) {
  return `${prefix}-${String(id).padStart(4, '0')}`;
}

// Builds the two T-format sides of the ledger (Credit = cash in, Debit =
// cash out), each a flat, date-ordered list of { date, voucher, particulars,
// reference, amount } rows — mirroring the Roznamcha Excel template exactly.
async function computeBreakdown(branchId, date) {
  const salesRows = await pool.query(
    `SELECT s.id, s.sale_date, s.advance_received, c.name AS customer_name
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.branch_id = $1 AND s.sale_date = $2 AND s.advance_received > 0
     ORDER BY s.id`,
    [branchId, date]
  );

  const recoveryRows = await pool.query(
    `SELECT sp.id, sp.sale_id, sp.payment_date, sp.amount_received, c.name AS customer_name
     FROM sale_payments sp
     JOIN sales s ON s.id = sp.sale_id
     LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.branch_id = $1 AND sp.payment_date = $2
     ORDER BY sp.id`,
    [branchId, date]
  );

  const expenseRows = await pool.query(
    `SELECT id, expense_date, category, description, amount, paid_to
     FROM expenses
     WHERE branch_id = $1 AND expense_date = $2 AND status = 'approved'
     ORDER BY id`,
    [branchId, date]
  );

  const refundRows = await pool.query(
    `SELECT r.id, r.sale_id, r.return_date, r.refund_amount, c.name AS customer_name
     FROM returns r
     JOIN sales s ON s.id = r.sale_id
     LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.branch_id = $1 AND r.return_date = $2
     ORDER BY r.id`,
    [branchId, date]
  );

  const credit = [
    ...salesRows.rows.map((s) => ({
      date: s.sale_date,
      voucher: voucherNumber('RCV', s.id),
      particulars: `Advance received — Sale #${s.id}`,
      reference: s.customer_name || 'Walk-in Customer',
      amount: Number(s.advance_received),
    })),
    ...recoveryRows.rows.map((r) => ({
      date: r.payment_date,
      voucher: voucherNumber('PAY', r.id),
      particulars: `Recovery payment — Sale #${r.sale_id}`,
      reference: r.customer_name || 'Walk-in Customer',
      amount: Number(r.amount_received),
    })),
  ].sort((a, b) => (a.voucher > b.voucher ? 1 : -1));

  const debit = [
    ...expenseRows.rows.map((e) => ({
      date: e.expense_date,
      voucher: voucherNumber('EXP', e.id),
      particulars: e.description || e.category,
      reference: e.paid_to || '—',
      amount: Number(e.amount),
    })),
    ...refundRows.rows.map((r) => ({
      date: r.return_date,
      voucher: voucherNumber('REF', r.id),
      particulars: `Refund issued — Sale #${r.sale_id}`,
      reference: r.customer_name || 'Walk-in Customer',
      amount: Number(r.refund_amount),
    })),
  ].sort((a, b) => (a.voucher > b.voucher ? 1 : -1));

  return { credit, debit };
}

// Opening cash is never entered manually — it always equals the previous
// day's closing balance for that branch (0 if there is no earlier entry).
async function getPreviousClosing(branchId, date) {
  const prevDay = await pool.query(
    `SELECT closing_cash FROM daily_cashbook WHERE branch_id = $1 AND ledger_date < $2 AND deleted_at IS NULL ORDER BY ledger_date DESC LIMIT 1`,
    [branchId, date]
  );
  return prevDay.rows.length > 0 ? Number(prevDay.rows[0].closing_cash) : 0;
}

async function getBranchName(branchId) {
  const result = await pool.query(`SELECT name FROM branches WHERE id = $1`, [branchId]);
  return result.rows.length > 0 ? result.rows[0].name : null;
}

// GET /api/cashbook?date=YYYY-MM-DD&branch_id=(super_admin only)
// Returns the saved entry for that date if it exists, otherwise a live
// preview auto-computed from sales/payments/expenses/returns, plus the
// previous day's closing balance as a suggested opening balance.
router.get('/', async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;
    if (!branchId) return res.status(400).json({ error: 'branch_id is required.' });

    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const existing = await pool.query(
      `SELECT * FROM daily_cashbook WHERE branch_id = $1 AND ledger_date = $2 AND deleted_at IS NULL`,
      [branchId, date]
    );
    if (existing.rows.length > 0) {
      const breakdown = await computeBreakdown(branchId, date);
      const branchName = await getBranchName(branchId);
      return res.json({ ...existing.rows[0], breakdown, branch_name: branchName, saved: true });
    }

    const suggestedOpening = await getPreviousClosing(branchId, date);

    const auto = await computeAutoTotals(branchId, date);
    const breakdown = await computeBreakdown(branchId, date);
    const branchName = await getBranchName(branchId);

    res.json({
      branch_id: branchId,
      branch_name: branchName,
      ledger_date: date,
      opening_cash: suggestedOpening,
      ...auto,
      breakdown,
      cash_in_other: 0,
      closing_cash: suggestedOpening + auto.cash_in_sales + auto.cash_in_recovery - auto.cash_out_expenses - auto.cash_out_refunds,
      adjustment_note: null,
      saved: false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load cashbook entry.' });
  }
});

// GET /api/cashbook/history?branch_id=(super_admin only)
router.get('/history', async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;

    const conditions = ['deleted_at IS NULL'];
    const params = [];
    if (branchId) { params.push(branchId); conditions.push(`branch_id = $${params.length}`); }

    const result = await pool.query(
      `SELECT * FROM daily_cashbook WHERE ${conditions.join(' AND ')} ORDER BY ledger_date DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load cashbook history.' });
  }
});

// GET /api/cashbook/trash?branch_id=(super_admin only)
// Entries deleted within the last 3 days. After 3 days an entry simply
// stops appearing here — the row is never physically removed.
router.get('/trash', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;

    const params = [];
    let branchClause = '';
    if (branchId) { params.push(branchId); branchClause = `AND c.branch_id = $${params.length}`; }

    const result = await pool.query(
      `SELECT c.*, u.name AS deleted_by_name, b.name AS branch_name
       FROM daily_cashbook c
       LEFT JOIN users u ON u.id = c.deleted_by
       LEFT JOIN branches b ON b.id = c.branch_id
       WHERE c.deleted_at IS NOT NULL AND c.deleted_at > NOW() - INTERVAL '3 days' ${branchClause}
       ORDER BY c.deleted_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load trash.' });
  }
});

// POST /api/cashbook/trash/:id/restore
router.post('/trash/:id/restore', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM daily_cashbook WHERE id = $1 AND deleted_at IS NOT NULL', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Entry not found in trash.' });
    const entry = existing.rows[0];

    if (req.user.role !== 'super_admin' && entry.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this entry.' });
    }

    await pool.query('UPDATE daily_cashbook SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', [req.params.id]);
    res.json({ message: 'Entry restored.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not restore entry.' });
  }
});

// DELETE /api/cashbook/:id  (soft delete — moves to Trash, notifies super admin)
router.delete('/:id', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM daily_cashbook WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Entry not found.' });
    const entry = existing.rows[0];

    if (req.user.role !== 'super_admin' && entry.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this entry.' });
    }

    await pool.query('UPDATE daily_cashbook SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2', [req.user.userId, req.params.id]);

    const branchName = await getBranchName(entry.branch_id);
    sendDeletionAlert({
      username: req.user.username,
      branchName: branchName || 'Unknown Branch',
      itemType: 'Daily Cashbook Entry',
      itemDescription: `Ledger date: ${entry.ledger_date}`,
    }).catch((e) => console.error('Failed to send deletion alert:', e.message));

    res.json({ message: 'Entry moved to trash.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete entry.' });
  }
});

// POST /api/cashbook  (save/upsert an entry for a date)
// Body: { ledger_date, cash_in_other, adjustment_note, branch_id (super_admin only) }
// opening_cash / cash_in_sales / cash_in_recovery / cash_out_expenses / cash_out_refunds
// are always computed server-side (opening = previous day's closing; the rest
// from actual records) — never taken from the client, even if sent.
router.post('/', requireRole('super_admin', 'admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    const { ledger_date, cash_in_other, adjustment_note } = req.body;

    if (!ledger_date) return res.status(400).json({ error: 'ledger_date is required.' });

    const auto = await computeAutoTotals(branchId, ledger_date);
    const openingCash = await getPreviousClosing(branchId, ledger_date);
    const cashInOther = Number(cash_in_other) || 0;
    const closingCash = openingCash + auto.cash_in_sales + auto.cash_in_recovery + cashInOther
      - auto.cash_out_expenses - auto.cash_out_refunds;

    const approvedBy = ['super_admin', 'admin', 'manager'].includes(req.user.role) ? req.user.userId : null;

    const result = await pool.query(
      `INSERT INTO daily_cashbook
        (branch_id, ledger_date, opening_cash, cash_in_sales, cash_in_recovery, cash_in_other,
         cash_out_expenses, cash_out_refunds, closing_cash, adjustment_note, approved_by, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (branch_id, ledger_date) DO UPDATE SET
         opening_cash = EXCLUDED.opening_cash,
         cash_in_sales = EXCLUDED.cash_in_sales,
         cash_in_recovery = EXCLUDED.cash_in_recovery,
         cash_in_other = EXCLUDED.cash_in_other,
         cash_out_expenses = EXCLUDED.cash_out_expenses,
         cash_out_refunds = EXCLUDED.cash_out_refunds,
         closing_cash = EXCLUDED.closing_cash,
         adjustment_note = EXCLUDED.adjustment_note,
         approved_by = EXCLUDED.approved_by
       RETURNING *`,
      [branchId, ledger_date, openingCash, auto.cash_in_sales, auto.cash_in_recovery, cashInOther,
       auto.cash_out_expenses, auto.cash_out_refunds, closingCash, adjustment_note || null, approvedBy, req.user.userId]
    );

    const breakdown = await computeBreakdown(branchId, ledger_date);
    const branchName = await getBranchName(branchId);
    res.status(201).json({ ...result.rows[0], breakdown, branch_name: branchName });
  } catch (err) {
    const status = err.status || 500;
    console.error(err);
    res.status(status).json({ error: err.message || 'Could not save cashbook entry.' });
  }
});

module.exports = router;
