const express = require('express');
const pool = require('../db/pool');
const { logAction } = require('../db/auditLog');
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

// GET /api/sales?branch_id=(super_admin only)&status=&customer_id=&sale_category=
router.get('/', async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;

    const conditions = ['s.deleted_at IS NULL'];
    const params = [];
    if (branchId) { params.push(branchId); conditions.push(`s.branch_id = $${params.length}`); }
    if (req.query.status) { params.push(req.query.status); conditions.push(`s.status = $${params.length}`); }
    if (req.query.customer_id) { params.push(req.query.customer_id); conditions.push(`s.customer_id = $${params.length}`); }
    if (req.query.sale_category) { params.push(req.query.sale_category); conditions.push(`s.sale_category = $${params.length}`); }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT s.*, c.name AS customer_name
       FROM sales s
       JOIN customers c ON c.id = s.customer_id
       ${whereClause}
       ORDER BY s.created_at DESC`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load sales.' });
  }
});

// GET /api/sales/trash?branch_id=(super_admin only)
router.get('/trash', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;

    const params = [];
    let branchClause = '';
    if (branchId) { params.push(branchId); branchClause = `AND s.branch_id = $${params.length}`; }

    const result = await pool.query(
      `SELECT s.*, c.name AS customer_name, u.name AS deleted_by_name, b.name AS branch_name
       FROM sales s
       JOIN customers c ON c.id = s.customer_id
       LEFT JOIN users u ON u.id = s.deleted_by
       LEFT JOIN branches b ON b.id = s.branch_id
       WHERE s.deleted_at IS NOT NULL AND s.deleted_at > NOW() - INTERVAL '3 days' ${branchClause}
       ORDER BY s.deleted_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load trash.' });
  }
});

// POST /api/sales/trash/:id/restore
router.post('/trash/:id/restore', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM sales WHERE id = $1 AND deleted_at IS NOT NULL', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Sale not found in trash.' });
    const sale = existing.rows[0];

    if (req.user.role !== 'super_admin' && sale.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this sale.' });
    }

    await pool.query('UPDATE sales SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', [req.params.id]);
    res.json({ message: 'Sale restored.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not restore sale.' });
  }
});

// GET /api/sales/:id  (full detail: items, payment plan, documents, customer)
router.get('/:id', async (req, res) => {
  try {
    const saleResult = await pool.query(
      `SELECT s.*, c.name AS customer_name, c.mobile_no AS customer_mobile,
              c.father_name AS customer_father_name, c.address AS customer_address,
              b.name AS branch_name, b.address AS branch_address, b.phone AS branch_phone
       FROM sales s
       JOIN customers c ON c.id = s.customer_id
       JOIN branches b ON b.id = s.branch_id
       WHERE s.id = $1 AND s.deleted_at IS NULL`,
      [req.params.id]
    );
    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found.' });
    }
    const sale = saleResult.rows[0];

    if (req.user.role !== 'super_admin' && sale.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this sale.' });
    }

    const items = await pool.query(
      `SELECT si.*, i.stock_code, i.title, i.item_type, i.purchase_price,
              vd.engine_no, vd.chassis_no, vd.model
       FROM sale_items si
       JOIN inventory_items i ON i.id = si.inventory_item_id
       LEFT JOIN inventory_vehicle_details vd ON vd.inventory_item_id = i.id
       WHERE si.sale_id = $1`,
      [req.params.id]
    );
    const plan = await pool.query(
      `SELECT * FROM sale_payment_plan WHERE sale_id = $1 ORDER BY installment_no ASC`,
      [req.params.id]
    );
    const documents = await pool.query(
      `SELECT * FROM sale_documents WHERE sale_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json({ ...sale, items: items.rows, payment_plan: plan.rows, documents: documents.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load sale.' });
  }
});

// PUT /api/sales/:id/payment-plan
// Body: { installments: [{ id, due_date, expected_amount }, ...] }
//
// Lets staff correct an installment schedule after the sale has already
// been created -- e.g. a wrong due date or amount was entered, or the
// customer and branch agreed to restructure the remaining installments.
// This only EDITS existing rows (matched by id) -- it does not add or
// remove installments, and it can edit an installment even if payments
// have already been recorded against it.
//
// The edited amounts must still add up to exactly (total_amount -
// advance_received) -- the same rule enforced when the plan was first
// created -- so the schedule can never drift from what the sale actually
// owes.
router.put('/:id/payment-plan', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    const saleResult = await client.query('SELECT * FROM sales WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [req.params.id]);
    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found.' });
    }
    const sale = saleResult.rows[0];

    if (req.user.role !== 'super_admin' && sale.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this sale.' });
    }

    const { installments } = req.body;
    if (!Array.isArray(installments) || installments.length === 0) {
      return res.status(400).json({ error: 'installments must be a non-empty array.' });
    }

    const existingResult = await client.query(
      'SELECT id FROM sale_payment_plan WHERE sale_id = $1',
      [req.params.id]
    );
    const existingIds = new Set(existingResult.rows.map((r) => r.id));

    if (installments.length !== existingIds.size) {
      return res.status(400).json({ error: 'This only edits the existing installments -- it cannot add or remove rows.' });
    }
    for (const inst of installments) {
      if (!existingIds.has(Number(inst.id))) {
        return res.status(400).json({ error: `Installment ${inst.id} does not belong to this sale.` });
      }
      if (!inst.due_date) {
        return res.status(400).json({ error: 'Every installment needs a due date.' });
      }
      if (!(Number(inst.expected_amount) > 0)) {
        return res.status(400).json({ error: 'Every installment amount must be greater than zero.' });
      }
    }

    const planBase = Number(sale.total_amount) - Number(sale.advance_received);
    const newTotal = installments.reduce((sum, i) => sum + Number(i.expected_amount), 0);
    if (Math.abs(newTotal - planBase) > 0.01) {
      return res.status(400).json({
        error: `Installments must add up to ${planBase.toLocaleString()} (total amount minus advance received). They currently add up to ${newTotal.toLocaleString()}.`,
      });
    }

    await client.query('BEGIN');
    for (const inst of installments) {
      await client.query(
        `UPDATE sale_payment_plan SET due_date = $1, expected_amount = $2 WHERE id = $3 AND sale_id = $4`,
        [inst.due_date, Number(inst.expected_amount), inst.id, req.params.id]
      );
    }
    await client.query('COMMIT');

    const updatedPlan = await pool.query(
      'SELECT * FROM sale_payment_plan WHERE sale_id = $1 ORDER BY installment_no ASC',
      [req.params.id]
    );
    logAction(req.user.userId, 'edit_installment_plan', 'sale', req.params.id);
    res.json(updatedPlan.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not update installment plan.' });
  } finally {
    client.release();
  }
});

// DELETE /api/sales/:id
router.delete('/:id', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Sale not found.' });
    const sale = existing.rows[0];

    if (req.user.role !== 'super_admin' && sale.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this sale.' });
    }

    await client.query('BEGIN');

    const items = await client.query(
      `SELECT si.*, i.item_type FROM sale_items si JOIN inventory_items i ON i.id = si.inventory_item_id WHERE si.sale_id = $1`,
      [req.params.id]
    );
    for (const item of items.rows) {
      if (item.item_type === 'spare_part') {
        await client.query(
          `UPDATE inventory_spare_part_details SET quantity_on_hand = quantity_on_hand + $1 WHERE inventory_item_id = $2`,
          [item.quantity, item.inventory_item_id]
        );
      }
      await client.query(`UPDATE inventory_items SET status = 'in_stock' WHERE id = $1`, [item.inventory_item_id]);
    }

    await client.query('DELETE FROM customer_ledger WHERE sale_id = $1', [req.params.id]);

    await client.query('DELETE FROM sales WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');

    const branchResult = await pool.query('SELECT name FROM branches WHERE id = $1', [sale.branch_id]);
    sendDeletionAlert({
      username: req.user.username,
      branchName: branchResult.rows[0]?.name || 'Unknown Branch',
      itemType: 'Sale',
      itemDescription: `Receipt No: ${sale.receipt_no} (permanently deleted)`,
    }).catch((e) => console.error('Failed to send deletion alert:', e.message));

    logAction(req.user.userId, 'delete_sale', 'sale', req.params.id);
    res.json({ message: 'Sale permanently deleted. Items are available for sale again.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not delete sale.' });
  } finally {
    client.release();
  }
});

// POST /api/sales
router.post('/', requireRole('super_admin', 'admin', 'manager', 'sales_staff'), async (req, res) => {
  const client = await pool.connect();
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    const { customer_id, items, discount, advance_received, installment_plan, documents, receipt_no, sale_date } = req.body;

    if (!customer_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'customer_id and at least one item are required.' });
    }
    if (!receipt_no || !receipt_no.trim()) {
      return res.status(400).json({ error: 'Receipt number is required.' });
    }

    const discountAmount = Number(discount) || 0;
    if (discountAmount > 0 && !['super_admin', 'admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Discounts require manager approval. Ask a manager to apply this discount.' });
    }

    await client.query('BEGIN');

    let subtotal = 0;
    const itemDetails = [];
    for (const line of items) {
      const itemResult = await client.query(
        `SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE`,
        [line.inventory_item_id]
      );
      if (itemResult.rows.length === 0) {
        throw Object.assign(new Error(`Inventory item ${line.inventory_item_id} not found.`), { status: 400 });
      }
      const item = itemResult.rows[0];
      if (item.branch_id !== branchId) {
        throw Object.assign(new Error(`Item ${item.stock_code} does not belong to this branch.`), { status: 400 });
      }
      if (item.status !== 'in_stock' && item.status !== 'reserved') {
        throw Object.assign(new Error(`Item ${item.stock_code} is not available for sale (status: ${item.status}).`), { status: 400 });
      }
      const qty = Number(line.quantity) || 1;
      const unitPrice = Number(line.unit_price);
      subtotal += qty * unitPrice;
      itemDetails.push({ item, qty, unitPrice });
    }

    const vehicleLines = itemDetails.filter((d) => d.item.item_type !== 'spare_part');
    const sparePartLines = itemDetails.filter((d) => d.item.item_type === 'spare_part');
    if (vehicleLines.length > 0 && sparePartLines.length > 0) {
      throw Object.assign(new Error('An automobile sale and a spare parts sale cannot be combined on the same invoice.'), { status: 400 });
    }
    const isAutomobileSale = vehicleLines.length > 0;
    const saleCategory = isAutomobileSale ? 'automobile' : 'spare_part';

    if (isAutomobileSale) {
      const badLine = vehicleLines.find((d) => d.qty !== 1);
      if (badLine) {
        throw Object.assign(new Error(`"${badLine.item.stock_code}" is a vehicle -- quantity must be 1 per line. Add another line to sell another vehicle.`), { status: 400 });
      }
    }

    if (!isAutomobileSale && Array.isArray(installment_plan) && installment_plan.length > 0) {
      throw Object.assign(new Error('Spare parts sales must be paid in full (net sale) -- installment plans are only available for automobile sales.'), { status: 400 });
    }

    const totalAmount = subtotal - discountAmount;
    const advanceReceived = Number(advance_received) || 0;
    const outstandingBalance = totalAmount - advanceReceived;

    if (!isAutomobileSale && outstandingBalance > 0) {
      throw Object.assign(new Error('Spare parts sales must be paid in full at the time of sale (net sale only).'), { status: 400 });
    }

    const initialStatus = outstandingBalance <= 0 ? 'completed' : 'active';

    const dupCheck = await client.query(
      'SELECT id FROM sales WHERE branch_id = $1 AND receipt_no = $2',
      [branchId, receipt_no.trim()]
    );
    if (dupCheck.rows.length > 0) {
      throw Object.assign(new Error(`Receipt number "${receipt_no.trim()}" already exists in this branch.`), { status: 409 });
    }
    const receiptNo = receipt_no.trim();

    const saleResult = await client.query(
      `INSERT INTO sales (receipt_no, customer_id, sale_date, subtotal, discount, discount_approved_by, total_amount,
                           advance_received, outstanding_balance, status, branch_id, created_by, sale_category)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [receiptNo, customer_id, sale_date || null, subtotal, discountAmount,
       discountAmount > 0 ? req.user.userId : null,
       totalAmount, advanceReceived, outstandingBalance, initialStatus, branchId, req.user.userId,
       saleCategory]
    );
    const sale = saleResult.rows[0];

    for (const { item, qty, unitPrice } of itemDetails) {
      await client.query(
        `INSERT INTO sale_items (sale_id, inventory_item_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`,
        [sale.id, item.id, qty, unitPrice]
      );

      if (item.item_type === 'spare_part') {
        const spResult = await client.query(
          `UPDATE inventory_spare_part_details
           SET quantity_on_hand = quantity_on_hand - $1
           WHERE inventory_item_id = $2 RETURNING quantity_on_hand`,
          [qty, item.id]
        );
        const remaining = spResult.rows[0]?.quantity_on_hand ?? 0;
        if (remaining <= 0) {
          await client.query(`UPDATE inventory_items SET status = 'sold' WHERE id = $1`, [item.id]);
        }
      } else {
        await client.query(`UPDATE inventory_items SET status = 'sold' WHERE id = $1`, [item.id]);
      }
    }

    if (Array.isArray(installment_plan)) {
      for (const [idx, inst] of installment_plan.entries()) {
        await client.query(
          `INSERT INTO sale_payment_plan (sale_id, installment_no, due_date, expected_amount)
           VALUES ($1, $2, $3, $4)`,
          [sale.id, idx + 1, inst.due_date, inst.expected_amount]
        );
      }
    }

    if (Array.isArray(documents)) {
      for (const doc of documents) {
        await client.query(
          `INSERT INTO sale_documents (sale_id, document_type, file_url) VALUES ($1, $2, $3)`,
          [sale.id, doc.document_type || null, doc.file_url]
        );
      }
    }

    await client.query(
      `INSERT INTO customer_ledger (customer_id, sale_id, entry_type, amount, description, entry_date)
       VALUES ($1, $2, 'debit', $3, $4, $5)`,
      [customer_id, sale.id, totalAmount, `Sale ${receiptNo}`, sale.sale_date]
    );
    if (advanceReceived > 0) {
      await client.query(
        `INSERT INTO customer_ledger (customer_id, sale_id, entry_type, amount, description, entry_date)
         VALUES ($1, $2, 'credit', $3, $4, $5)`,
        [customer_id, sale.id, advanceReceived, `Advance on sale ${receiptNo}`, sale.sale_date]
      );
    }

    await client.query('COMMIT');
    logAction(req.user.userId, 'create_sale', 'sale', sale.id);
    res.status(201).json(sale);
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.status || 500;
    console.error(err);
    res.status(status).json({ error: err.message || 'Could not create sale.' });
  } finally {
    client.release();
  }
});

module.exports = router;