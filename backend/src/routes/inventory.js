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

// Checks whether an engine_no or chassis_no is already used by another
// vehicle in this branch. Blank/null values are ignored (not enforced
// unique). excludeItemId is used when editing, to allow saving a vehicle
// with its own unchanged values.
async function checkVehicleDuplicate(client, branchId, engineNo, chassisNo, excludeItemId = null) {
  if (!engineNo && !chassisNo) return null;

  const conditions = ['i.branch_id = $1'];
  const params = [branchId];

  const orParts = [];
  if (engineNo) {
    params.push(engineNo);
    orParts.push(`vd.engine_no = $${params.length}`);
  }
  if (chassisNo) {
    params.push(chassisNo);
    orParts.push(`vd.chassis_no = $${params.length}`);
  }
  conditions.push(`(${orParts.join(' OR ')})`);

  if (excludeItemId) {
    params.push(excludeItemId);
    conditions.push(`i.id != $${params.length}`);
  }

  const result = await client.query(
    `SELECT i.stock_code, vd.engine_no, vd.chassis_no
     FROM inventory_vehicle_details vd
     JOIN inventory_items i ON i.id = vd.inventory_item_id
     WHERE ${conditions.join(' AND ')}
     LIMIT 1`,
    params
  );

  if (result.rows.length === 0) return null;

  const dup = result.rows[0];
  if (engineNo && dup.engine_no === engineNo) {
    return `Engine No "${engineNo}" is already used by another vehicle (Stock Code: ${dup.stock_code}).`;
  }
  if (chassisNo && dup.chassis_no === chassisNo) {
    return `Chassis No "${chassisNo}" is already used by another vehicle (Stock Code: ${dup.stock_code}).`;
  }
  return null;
}

// GET /api/inventory?item_type=&status=&branch_id=(super_admin only)&search=
router.get('/', async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;

    const conditions = ['i.deleted_at IS NULL'];
    const params = [];

    if (branchId) {
      params.push(branchId);
      conditions.push(`i.branch_id = $${params.length}`);
    }
    if (req.query.item_type) {
      params.push(req.query.item_type);
      conditions.push(`i.item_type = $${params.length}`);
    }
    if (req.query.status) {
      params.push(req.query.status);
      conditions.push(`i.status = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      conditions.push(`(i.title ILIKE $${params.length} OR i.stock_code ILIKE $${params.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT i.*, v.name AS vendor_name,
              vd.vehicle_type, vd.engine_no, vd.chassis_no, vd.registration_no, vd.model, vd.variant, vd.color,
              sp.part_no, sp.brand, sp.unit_type, sp.quantity_on_hand, sp.reorder_level
       FROM inventory_items i
       LEFT JOIN vendors v ON v.id = i.vendor_id
       LEFT JOIN inventory_vehicle_details vd ON vd.inventory_item_id = i.id
       LEFT JOIN inventory_spare_part_details sp ON sp.inventory_item_id = i.id
       ${whereClause}
       ORDER BY i.created_at DESC`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load inventory.' });
  }
});

// GET /api/inventory/trash?branch_id=(super_admin only)
// Items deleted within the last 3 days. After 3 days an item simply stops
// appearing here — the row is never physically removed from the database.
router.get('/trash', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;

    const params = [];
    let branchClause = '';
    if (branchId) { params.push(branchId); branchClause = `AND i.branch_id = $${params.length}`; }

    const result = await pool.query(
      `SELECT i.*, u.name AS deleted_by_name, b.name AS branch_name
       FROM inventory_items i
       LEFT JOIN users u ON u.id = i.deleted_by
       LEFT JOIN branches b ON b.id = i.branch_id
       WHERE i.deleted_at IS NOT NULL AND i.deleted_at > NOW() - INTERVAL '3 days' ${branchClause}
       ORDER BY i.deleted_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load trash.' });
  }
});

// POST /api/inventory/trash/:id/restore
router.post('/trash/:id/restore', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM inventory_items WHERE id = $1 AND deleted_at IS NOT NULL', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Item not found in trash.' });
    const item = existing.rows[0];

    if (req.user.role !== 'super_admin' && item.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this item.' });
    }

    await pool.query('UPDATE inventory_items SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', [req.params.id]);
    res.json({ message: 'Item restored.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not restore item.' });
  }
});

// GET /api/inventory/:id  (full detail incl. purchase/vendor info)
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, v.name AS vendor_name,
              vd.vehicle_type, vd.engine_no, vd.chassis_no, vd.registration_no, vd.model, vd.variant, vd.color,
              sp.part_no, sp.brand, sp.unit_type, sp.quantity_on_hand, sp.reorder_level
       FROM inventory_items i
       LEFT JOIN vendors v ON v.id = i.vendor_id
       LEFT JOIN inventory_vehicle_details vd ON vd.inventory_item_id = i.id
       LEFT JOIN inventory_spare_part_details sp ON sp.inventory_item_id = i.id
       WHERE i.id = $1 AND i.deleted_at IS NULL`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    const item = result.rows[0];

    if (req.user.role !== 'super_admin' && item.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this item.' });
    }

    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load item.' });
  }
});

// DELETE /api/inventory/:id  (soft delete — moves to Trash, notifies super admin)
router.delete('/:id', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM inventory_items WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Item not found.' });
    const item = existing.rows[0];

    if (req.user.role !== 'super_admin' && item.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this item.' });
    }

    await pool.query('UPDATE inventory_items SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2', [req.user.userId, req.params.id]);

    const branchResult = await pool.query('SELECT name FROM branches WHERE id = $1', [item.branch_id]);
    sendDeletionAlert({
      username: req.user.username,
      branchName: branchResult.rows[0]?.name || 'Unknown Branch',
      itemType: 'Inventory Item',
      itemDescription: `${item.title} (Stock Code: ${item.stock_code})`,
    }).catch((e) => console.error('Failed to send deletion alert:', e.message));

    res.json({ message: 'Item moved to trash.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete item.' });
  }
});

// POST /api/inventory
router.post('/', requireRole('super_admin', 'admin', 'manager', 'sales_staff'), async (req, res) => {
  const client = await pool.connect();
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    const {
      item_type, stock_code, title, vendor_id,
      purchase_price, purchase_date,
      vehicle_details, spare_part_details,
    } = req.body;

    if (!item_type || !stock_code || !title || !purchase_price || !purchase_date) {
      return res.status(400).json({ error: 'item_type, stock_code, title, purchase_price and purchase_date are required.' });
    }
    if (!['car', 'tractor', 'spare_part'].includes(item_type)) {
      return res.status(400).json({ error: 'item_type must be car, tractor, or spare_part.' });
    }

    await client.query('BEGIN');

    if (item_type === 'car' || item_type === 'tractor') {
      const d = vehicle_details || {};
      const dupError = await checkVehicleDuplicate(client, branchId, d.engine_no || null, d.chassis_no || null);
      if (dupError) {
        throw Object.assign(new Error(dupError), { status: 409 });
      }
    }

    const itemResult = await client.query(
      `INSERT INTO inventory_items (item_type, stock_code, title, vendor_id, purchase_price, purchase_date, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [item_type, stock_code, title, vendor_id || null, purchase_price, purchase_date, branchId]
    );
    const item = itemResult.rows[0];

    if (item_type === 'car' || item_type === 'tractor') {
      const d = vehicle_details || {};
      await client.query(
        `INSERT INTO inventory_vehicle_details
          (inventory_item_id, vehicle_type, engine_no, chassis_no, registration_no, model, variant, color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [item.id, item_type, d.engine_no || null, d.chassis_no || null, d.registration_no || null,
         d.model || null, d.variant || null, d.color || null]
      );
    } else {
      const d = spare_part_details || {};
      await client.query(
        `INSERT INTO inventory_spare_part_details
          (inventory_item_id, part_no, brand, unit_type, quantity_on_hand, reorder_level)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [item.id, d.part_no || null, d.brand || null, d.unit_type || null,
         d.quantity_on_hand || 0, d.reorder_level || 0]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(item);
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.status || (err.code === '23505' ? 409 : 500);
    const message = err.code === '23505'
      ? 'A stock code already exists in this branch — use a different one.'
      : (err.message || 'Could not create item.');
    console.error(err);
    res.status(status).json({ error: message });
  } finally {
    client.release();
  }
});

// PUT /api/inventory/:id
router.put('/:id', requireRole('super_admin', 'admin', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT * FROM inventory_items WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found.' });
    }
    const item = existing.rows[0];

    if (req.user.role !== 'super_admin' && item.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this item.' });
    }

    const {
      title, vendor_id, purchase_price, purchase_date, status,
      vehicle_details, spare_part_details,
    } = req.body;

    await client.query('BEGIN');

    if ((item.item_type === 'car' || item.item_type === 'tractor') && vehicle_details) {
      const d = vehicle_details;
      if (d.engine_no || d.chassis_no) {
        const dupError = await checkVehicleDuplicate(client, item.branch_id, d.engine_no || null, d.chassis_no || null, item.id);
        if (dupError) {
          throw Object.assign(new Error(dupError), { status: 409 });
        }
      }
    }

    await client.query(
      `UPDATE inventory_items
       SET title = COALESCE($1, title),
           vendor_id = COALESCE($2, vendor_id),
           purchase_price = COALESCE($3, purchase_price),
           purchase_date = COALESCE($4, purchase_date),
           status = COALESCE($5, status)
       WHERE id = $6`,
      [title, vendor_id, purchase_price, purchase_date, status, req.params.id]
    );

    if (item.item_type === 'car' || item.item_type === 'tractor') {
      const d = vehicle_details || {};
      await client.query(
        `UPDATE inventory_vehicle_details
         SET engine_no = COALESCE($1, engine_no),
             chassis_no = COALESCE($2, chassis_no),
             registration_no = COALESCE($3, registration_no),
             model = COALESCE($4, model),
             variant = COALESCE($5, variant),
             color = COALESCE($6, color)
         WHERE inventory_item_id = $7`,
        [d.engine_no, d.chassis_no, d.registration_no, d.model, d.variant, d.color, req.params.id]
      );
    } else if (item.item_type === 'spare_part') {
      const d = spare_part_details || {};
      await client.query(
        `UPDATE inventory_spare_part_details
         SET part_no = COALESCE($1, part_no),
             brand = COALESCE($2, brand),
             unit_type = COALESCE($3, unit_type),
             quantity_on_hand = COALESCE($4, quantity_on_hand),
             reorder_level = COALESCE($5, reorder_level)
         WHERE inventory_item_id = $6`,
        [d.part_no, d.brand, d.unit_type, d.quantity_on_hand, d.reorder_level, req.params.id]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Item updated.' });
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.status || 500;
    console.error(err);
    res.status(status).json({ error: err.message || 'Could not update item.' });
  } finally {
    client.release();
  }
});

// POST /api/inventory/bulk-vehicles
router.post('/bulk-vehicles', requireRole('super_admin', 'admin', 'manager', 'sales_staff'), async (req, res) => {
  const client = await pool.connect();
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    const { item_type, title, vendor_id, purchase_date, units } = req.body;

    if (!['car', 'tractor'].includes(item_type)) {
      return res.status(400).json({ error: 'item_type must be car or tractor for bulk vehicle entry.' });
    }
    if (!title || !purchase_date || !Array.isArray(units) || units.length === 0) {
      return res.status(400).json({ error: 'title, purchase_date, and at least one unit are required.' });
    }
    for (const [idx, u] of units.entries()) {
      if (!u.stock_code || !u.purchase_price) {
        return res.status(400).json({ error: `Unit ${idx + 1}: stock_code and purchase_price are required.` });
      }
    }

    // Duplicate check WITHIN the submitted batch itself first.
    const seenEngine = new Map();
    const seenChassis = new Map();
    for (const [idx, u] of units.entries()) {
      if (u.engine_no) {
        if (seenEngine.has(u.engine_no)) {
          return res.status(400).json({ error: `Unit ${idx + 1}: Engine No "${u.engine_no}" is duplicated with Unit ${seenEngine.get(u.engine_no) + 1} in this batch.` });
        }
        seenEngine.set(u.engine_no, idx);
      }
      if (u.chassis_no) {
        if (seenChassis.has(u.chassis_no)) {
          return res.status(400).json({ error: `Unit ${idx + 1}: Chassis No "${u.chassis_no}" is duplicated with Unit ${seenChassis.get(u.chassis_no) + 1} in this batch.` });
        }
        seenChassis.set(u.chassis_no, idx);
      }
    }

    await client.query('BEGIN');

    // Duplicate check against EXISTING inventory in the branch
    for (const [idx, u] of units.entries()) {
      const dupError = await checkVehicleDuplicate(client, branchId, u.engine_no || null, u.chassis_no || null);
      if (dupError) {
        throw Object.assign(new Error(`Unit ${idx + 1}: ${dupError}`), { status: 409 });
      }
    }

    const createdItems = [];

    for (const u of units) {
      const itemResult = await client.query(
        `INSERT INTO inventory_items (item_type, stock_code, title, vendor_id, purchase_price, purchase_date, branch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [item_type, u.stock_code, title, vendor_id || null, u.purchase_price, purchase_date, branchId]
      );
      const item = itemResult.rows[0];

      await client.query(
        `INSERT INTO inventory_vehicle_details
          (inventory_item_id, vehicle_type, engine_no, chassis_no, registration_no, model, variant, variant_feature, color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [item.id, item_type, u.engine_no || null, u.chassis_no || null, u.registration_no || null,
         u.model || null, u.variant || null, u.variant_feature || null, u.color || null]
      );

      createdItems.push(item);
    }

    await client.query('COMMIT');
    res.status(201).json({ created: createdItems.length, items: createdItems });
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.status || (err.code === '23505' ? 409 : 500);
    const message = err.code === '23505'
      ? 'One of the stock codes already exists in this branch — use different ones.'
      : (err.message || 'Could not create vehicles.');
    console.error(err);
    res.status(status).json({ error: message });
  } finally {
    client.release();
  }
});

module.exports = router;
