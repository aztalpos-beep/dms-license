const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { logAction } = require('../db/auditLog');
const { requireAuth } = require('../middleware/auth');
const { sendPasswordResetAlert } = require('../utils/mailer');

const router = express.Router();

// GET /api/branches
// Public endpoint - powers the landing page's 3 branch cards.
// Only returns id/name/location, never user or credential data.
router.get('/branches', async (req, res) => {
  try {
    const host = req.hostname || '';
    const isDemo = host.startsWith('demo.');

    const result = await pool.query(
      'SELECT id, name, location FROM branches WHERE is_active = TRUE AND is_demo = $1 ORDER BY id ASC',
      [isDemo]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load branches.' });
  }
});

// POST /api/auth/login
// Body: { branch_id, username, password }
// This is the ONLY way non-super-admin users authenticate.
// The query is scoped to branch_id, so the same username in another
// branch is a completely different account and will not match here.
router.post('/login', async (req, res) => {
  const { branch_id, username, password } = req.body;

  if (!branch_id || !username || !password) {
    return res.status(400).json({ error: 'branch_id, username and password are required.' });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.username, u.password_hash, u.role, u.branch_id, b.name AS branch_name
       FROM users u
       JOIN branches b ON b.id = u.branch_id
       WHERE u.branch_id = $1 AND u.username = $2 AND u.is_active = TRUE`,
      [branch_id, username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user = result.rows[0];
    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        branchId: user.branch_id,
        username: user.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );

    logAction(user.id, 'login', 'user', user.id);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        branchId: user.branch_id,
        branchName: user.branch_name,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/auth/forgot-password
// Body: { branch_id, username }
// Public endpoint — a branch user who forgot their password submits their
// username here. We email the super admin with the details; we do NOT
// reset or reveal anything to the requester. The super admin then sets a
// new password from Administration → Users & Roles → Change Password and
// shares it with the user directly.
router.post('/forgot-password', async (req, res) => {
  const { branch_id, username } = req.body;

  if (!branch_id || !username) {
    return res.status(400).json({ error: 'branch_id and username are required.' });
  }

  try {
    const result = await pool.query(
      `SELECT u.name, u.username, b.name AS branch_name
       FROM users u
       JOIN branches b ON b.id = u.branch_id
       WHERE u.branch_id = $1 AND u.username = $2 AND u.is_active = TRUE`,
      [branch_id, username]
    );

    if (result.rows.length > 0) {
      const u = result.rows[0];
      try {
        await sendPasswordResetAlert({ userName: u.name, username: u.username, branchName: u.branch_name });
      } catch (mailErr) {
        console.error('Failed to send password reset email:', mailErr.message);
      }
    }

    // Always return the same generic response — don't reveal whether the
    // username exists, this avoids leaking valid usernames to anyone probing.
    res.json({ message: 'If this account exists, your admin has been notified and will contact you with a new password.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not process request.' });
  }
});

// POST /api/auth/super-admin-login
// Body: { username, password }
// No branch_id — super_admin rows always have branch_id = NULL.
router.post('/super-admin-login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required.' });
  }

  try {
    const result = await pool.query(
      `SELECT id, name, username, password_hash, role
       FROM users
       WHERE branch_id IS NULL AND username = $1 AND role = 'super_admin' AND is_active = TRUE`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user = result.rows[0];
    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        branchId: null,
        username: user.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );

    logAction(user.id, 'login', 'user', user.id);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        branchId: null,
        branchName: 'Head Office',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/auth/logout — logs the logout time for activity tracking.
router.post('/logout', requireAuth, (req, res) => {
  logAction(req.user.userId, 'logout', 'user', req.user.userId);
  res.json({ message: 'Logged out.' });
});

module.exports = router;

