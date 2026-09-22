const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendDeletionAlert } = require('../utils/mailer');

const router = express.Router();
router.use(requireAuth);

// Resolves which branch_id a request should operate on.
// Non-super_admin users are ALWAYS locked to their own branch, no matter
// what they send in the body/query — this is enforced server-side, not
// just hidden in the UI.
function resolveBranchId(req, providedBranchId) {
  if (req.user.role === 'super_admin') {
    if (!providedBranchId) {
      throw Object.assign(new Error('branch_id is required for super_admin requests.'), { status: 400 });
    }
    return Number(providedBranchId);
  }
  return req.user.branchId;
}

// GET /api/vendors?branch_id=  (branch_id only used/required for super_admin)
router.get('/', async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;

    const result = branchId
      ? await pool.query('SELECT * FROM vendors WHERE branch_id = $1 AND deleted_at IS NULL ORDER BY name ASC', [branchId])
      : await pool.query('SELECT * FROM vendors WHERE deleted_at IS NULL ORDER BY branch_id ASC, name ASC');

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load vendors.' });
  }
});

// GET /api/vendors/trash?branch_id=(super_admin only)
// Vendors deleted within the last 3 days. After 3 days a vendor simply
// stops appearing here — the row is never physically removed.
router.get('/trash', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;

    const params = [];
    let branchClause = '';
    if (branchId) { params.push(branchId); branchClause = `AND v.branch_id = $${params.length}`; }

    const result = await pool.query(
      `SELECT v.*, u.name AS deleted_by_name, b.name AS branch_name
       FROM vendors v
       LEFT JOIN users u ON u.id = v.deleted_by
       LEFT JOIN branches b ON b.id = v.branch_id
       WHERE v.deleted_at IS NOT NULL AND v.deleted_at > NOW() - INTERVAL '3 days' ${branchClause}
       ORDER BY v.deleted_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load trash.' });
  }
});

// POST /api/vendors/trash/:id/restore
router.post('/trash/:id/restore', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM vendors WHERE id = $1 AND deleted_at IS NOT NULL', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Vendor not found in trash.' });
    const vendor = existing.rows[0];

    if (req.user.role !== 'super_admin' && vendor.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this vendor.' });
    }

    await pool.query('UPDATE vendors SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', [req.params.id]);
    res.json({ message: 'Vendor restored.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not restore vendor.' });
  }
});

// POST /api/vendors
router.post('/', async (req, res) => {
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    const { name, phone, address } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Vendor name is required.' });
    }

    const result = await pool.query(
      `INSERT INTO vendors (name, phone, address, branch_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, phone || null, address || null, branchId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    const status = err.status || 500;
    console.error(err);
    res.status(status).json({ error: err.message || 'Could not create vendor.' });
  }
});

// GET /api/vendors/:id  (with linked purchase history — items bought from this vendor)
router.get('/:id', async (req, res) => {
  try {
    const vendorResult = await pool.query('SELECT * FROM vendors WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (vendorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found.' });
    }

    const vendor = vendorResult.rows[0];

    if (req.user.role !== 'super_admin' && vendor.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this vendor.' });
    }

    const purchases = await pool.query(
      `SELECT id, item_type, stock_code, title, purchase_price, purchase_date, status
       FROM inventory_items WHERE vendor_id = $1 ORDER BY purchase_date DESC`,
      [req.params.id]
    );

    res.json({ ...vendor, purchases: purchases.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load vendor.' });
  }
});

// DELETE /api/vendors/:id  (soft delete — moves to Trash, notifies super admin)
router.delete('/:id', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM vendors WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Vendor not found.' });
    const vendor = existing.rows[0];

    if (req.user.role !== 'super_admin' && vendor.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this vendor.' });
    }

    await pool.query('UPDATE vendors SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2', [req.user.userId, req.params.id]);

    const branchResult = await pool.query('SELECT name FROM branches WHERE id = $1', [vendor.branch_id]);
    sendDeletionAlert({
      username: req.user.username,
      branchName: branchResult.rows[0]?.name || 'Unknown Branch',
      itemType: 'Vendor',
      itemDescription: vendor.name,
    }).catch((e) => console.error('Failed to send deletion alert:', e.message));

    res.json({ message: 'Vendor moved to trash.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete vendor.' });
  }
});

module.exports = router;
