const express = require('express');
const pool = require('../db/pool');
const { logAction } = require('../db/auditLog');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/returns?branch_id=(super_admin only)
router.get('/returns', async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;

    const params = [];
    let whereClause = '';
    if (branchId) { params.push(branchId); whereClause = `WHERE s.branch_id = $1`; }

    const result = await pool.query(
      `SELECT r.*, s.receipt_no, s.branch_id, c.name AS customer_name
       FROM returns r
       JOIN sales s ON s.id = r.sale_id
       JOIN customers c ON c.id = s.customer_id
       ${whereClause}
       ORDER BY r.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load returns.' });
  }
});

// POST /api/sales/:saleId/return
// Body: { refund_status, refund_amount, notes }
// Restores stock to inventory, marks the sale as returned, and forgives
// any remaining outstanding balance on the customer's ledger (a credit
// entry equal to whatever was still owed on this sale).
router.post('/sales/:saleId/return', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    const saleResult = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [req.params.saleId]);
    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found.' });
    }
    const sale = saleResult.rows[0];

    if (req.user.role !== 'super_admin' && sale.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this sale.' });
    }
    if (sale.status === 'returned') {
      return res.status(400).json({ error: 'This sale has already been returned.' });
    }

    const { refund_status, refund_amount, notes } = req.body;
    if (!['full', 'partial', 'none'].includes(refund_status)) {
      return res.status(400).json({ error: 'refund_status must be full, partial, or none.' });
    }

    await client.query('BEGIN');

    // Restore stock for every item on this sale
    const items = await client.query(
      `SELECT si.*, i.item_type FROM sale_items si JOIN inventory_items i ON i.id = si.inventory_item_id WHERE si.sale_id = $1`,
      [req.params.saleId]
    );
    for (const item of items.rows) {
      if (item.item_type === 'spare_part') {
        await client.query(
          `UPDATE inventory_spare_part_details SET quantity_on_hand = quantity_on_hand + $1 WHERE inventory_item_id = $2`,
          [item.quantity, item.inventory_item_id]
        );
      }
      await client.query(
        `UPDATE inventory_items SET status = 'in_stock' WHERE id = $1`,
        [item.inventory_item_id]
      );
    }

    // Forgive remaining balance on the customer's ledger for this sale
    const remainingBalance = Number(sale.outstanding_balance);
    if (remainingBalance > 0) {
      await client.query(
        `INSERT INTO customer_ledger (customer_id, sale_id, entry_type, amount, description, entry_date)
         VALUES ($1, $2, 'credit', $3, $4, CURRENT_DATE)`,
        [sale.customer_id, sale.id, remainingBalance, `Return on sale ${sale.receipt_no} — balance forgiven`]
      );
    }

    await client.query(
      `UPDATE sales SET status = 'returned', outstanding_balance = 0 WHERE id = $1`,
      [req.params.saleId]
    );

    const returnResult = await client.query(
      `INSERT INTO returns (sale_id, refund_status, refund_amount, stock_restored, notes, created_by)
       VALUES ($1, $2, $3, TRUE, $4, $5) RETURNING *`,
      [req.params.saleId, refund_status, Number(refund_amount) || 0, notes || null, req.user.userId]
    );

    await client.query('COMMIT');
    logAction(req.user.userId, 'process_return', 'sale', req.params.saleId);
    res.status(201).json(returnResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not process return.' });
  } finally {
    client.release();
  }
});

module.exports = router;