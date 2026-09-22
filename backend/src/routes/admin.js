const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('super_admin'));

// ---- Users ----

// GET /api/admin/users?branch_id=(super_admin only)
router.get('/users', async (req, res) => {
  try {
    const branchId = req.user.role === 'super_admin'
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : req.user.branchId;

    const params = [];
    let whereClause = '';
    if (branchId) { params.push(branchId); whereClause = 'WHERE branch_id = $1'; }

    const result = await pool.query(
      `SELECT id, name, username, role, branch_id, is_active, created_at FROM users ${whereClause} ORDER BY branch_id, name`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load users.' });
  }
});

// POST /api/admin/users
// Body: { name, username, password, role, branch_id (super_admin only) }
router.post('/users', async (req, res) => {
  try {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: 'name, username, password, and role are required.' });
    }
    if (role === 'super_admin') {
      return res.status(403).json({ error: 'super_admin accounts cannot be created through this screen.' });
    }

    let branchId;
    if (req.user.role === 'super_admin') {
      if (!req.body.branch_id) return res.status(400).json({ error: 'branch_id is required for super_admin requests.' });
      branchId = Number(req.body.branch_id);
    } else {
      branchId = req.user.branchId;
      // admin/manager cannot create another admin above their own standing
      if (req.user.role === 'manager' && ['admin'].includes(role)) {
        return res.status(403).json({ error: 'Managers cannot create admin accounts.' });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, username, password_hash, role, branch_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, username, role, branch_id, is_active`,
      [name, username, hash, role, branchId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    const status = err.code === '23505' ? 409 : 500;
    const message = err.code === '23505' ? 'That username already exists in this branch.' : 'Could not create user.';
    console.error(err);
    res.status(status).json({ error: message });
  }
});

// PUT /api/admin/users/:id  (toggle active, change role/name)
router.put('/users/:id', async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    const target = existing.rows[0];

    if (req.user.role !== 'super_admin' && target.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this user.' });
    }
    if (target.role === 'super_admin') {
      return res.status(403).json({ error: 'super_admin accounts cannot be edited here.' });
    }

    const { name, role, is_active } = req.body;
    await pool.query(
      `UPDATE users SET name = COALESCE($1, name), role = COALESCE($2, role), is_active = COALESCE($3, is_active) WHERE id = $4`,
      [name, role, is_active, req.params.id]
    );
    res.json({ message: 'User updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update user.' });
  }
});

// PUT /api/admin/users/:id/password  (super_admin, or branch admin/manager for their own team)
// Body: { password }
router.put('/users/:id/password', async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    const target = existing.rows[0];

    if (req.user.role !== 'super_admin' && target.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'You do not have access to this user.' });
    }
    if (target.role === 'super_admin' && req.user.userId !== target.id) {
      return res.status(403).json({ error: 'super_admin accounts cannot be edited here.' });
    }

    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    res.json({ message: 'Password updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update password.' });
  }
});

// ---- Branches ----

// GET /api/admin/branches  (full detail, admin view — vs the public /api/branches used on the landing page)
router.get('/branches', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM branches ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load branches.' });
  }
});

// POST /api/admin/branches  (super_admin only)
router.post('/branches', requireRole('super_admin'), async (req, res) => {
  try {
    const { name, location, address, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'Branch name is required.' });

    const result = await pool.query(
      `INSERT INTO branches (name, location, address, phone) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, location || null, address || null, phone || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create branch.' });
  }
});

// PUT /api/admin/branches/:id  (super_admin only — rename, activate/deactivate)
router.put('/branches/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const { name, location, address, phone, is_active } = req.body;
    await pool.query(
      `UPDATE branches SET name = COALESCE($1, name), location = COALESCE($2, location),
              address = COALESCE($3, address), phone = COALESCE($4, phone), is_active = COALESCE($5, is_active)
       WHERE id = $6`,
      [name, location, address, phone, is_active, req.params.id]
    );
    res.json({ message: 'Branch updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update branch.' });
  }
});

// ---- Audit Log ----

// GET /api/admin/audit-log
router.get('/audit-log', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.name AS user_name, u.branch_id
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT 200`
    );

    const rows = req.user.role === 'super_admin'
      ? result.rows
      : result.rows.filter((r) => r.branch_id === req.user.branchId || r.branch_id === null);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load audit log.' });
  }
});

module.exports = router;
