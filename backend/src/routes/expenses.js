const express = require('express');
const pool = require('../db/pool');
const { logAction } = require('../db/auditLog');
const { requireAuth, requireRole } = require('../middleware/auth');

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

// GET /api/expenses?status=&branch_id=(super_admin only)
router.get('/', async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;

    const conditions = [];
    const params = [];
    if (branchId) { params.push(branchId); conditions.push(`branch_id = $${params.length}`); }
    if (req.query.status) { params.push(req.query.status); conditions.push(`status = $${params.length}`); }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM expenses ${whereClause} ORDER BY expense_date DESC, id DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load expenses.' });
  }
});

// GET /api/expenses/summary/monthly?branch_id=(super_admin only)
// Approved expenses only, grouped by month.
router.get('/summary/monthly', async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;

    const conditions = ["status = 'approved'"];
    const params = [];
    if (branchId) { params.push(branchId); conditions.push(`branch_id = $${params.length}`); }

    const result = await pool.query(
      `SELECT to_char(expense_date, 'YYYY-MM') AS month, SUM(amount) AS total
       FROM expenses WHERE ${conditions.join(' AND ')}
       GROUP BY month ORDER BY month DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load expense summary.' });
  }
});

// POST /api/expenses  (submitted as pending; requires approval)
router.post('/', async (req, res) => {
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    const { expense_date, category, description, amount, receipt_image_url, paid_to } = req.body;

    if (!category || !amount) {
      return res.status(400).json({ error: 'category and amount are required.' });
    }

    const result = await pool.query(
      `INSERT INTO expenses (expense_date, category, description, amount, receipt_image_url, paid_to, branch_id, created_by)
       VALUES (COALESCE($1, CURRENT_DATE), $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [expense_date || null, category, description || null, amount, receipt_image_url || null, paid_to || null, branchId, req.user.userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    const status = err.status || 500;
    console.error(err);
    res.status(status).json({ error: err.message || 'Could not create expense.' });
  }
});

// PUT /api/expenses/:id/approve
router.put('/:id/approve', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM expenses WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Expense not found.' });
    const expense = existing.rows[0];
    if (req.user.role !== 'super_admin' && expense.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this expense.' });
    }

    await pool.query(
      `UPDATE expenses SET status = 'approved', approved_by = $1 WHERE id = $2`,
      [req.user.userId, req.params.id]
    );
    logAction(req.user.userId, 'approve_expense', 'expense', req.params.id);
    res.json({ message: 'Expense approved.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not approve expense.' });
  }
});

// PUT /api/expenses/:id/reject
router.put('/:id/reject', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM expenses WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Expense not found.' });
    const expense = existing.rows[0];
    if (req.user.role !== 'super_admin' && expense.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this expense.' });
    }

    await pool.query(
      `UPDATE expenses SET status = 'rejected', approved_by = $1 WHERE id = $2`,
      [req.user.userId, req.params.id]
    );
    logAction(req.user.userId, 'reject_expense', 'expense', req.params.id);
    res.json({ message: 'Expense rejected.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reject expense.' });
  }
});

module.exports = router;
