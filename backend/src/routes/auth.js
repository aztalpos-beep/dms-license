const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { logAction } = require('../db/auditLog');
const { requireAuth } = require('../middleware/auth');
const { sendPasswordResetAlert } = require('../utils/mailer');

const router = express.Router();

const DEMO_EXPIRED_MESSAGE =
  'Your 3-day Demo ERP trial has expired. Please contact us to activate your account.';

// GET /api/branches
router.get('/branches', async (req, res) => {
  try {
    const host = req.hostname || '';
    const isDemo = host.startsWith('demo.');

    const result = await pool.query(
      `SELECT id, name, location
       FROM branches
       WHERE is_active = TRUE
         AND is_demo = $1
       ORDER BY id ASC`,
      [isDemo]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load branches.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { branch_id, username, password } = req.body;

  if (!branch_id || !username || !password) {
    return res.status(400).json({
      error: 'branch_id, username and password are required.',
    });
  }

  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.username,
         u.password_hash,
         u.role,
         u.branch_id,
         b.name AS branch_name,
         b.is_demo,
         b.demo_started_at,
         b.demo_expires_at
       FROM users u
       JOIN branches b ON b.id = u.branch_id
       WHERE u.branch_id = $1
         AND u.username = $2
         AND u.is_active = TRUE
         AND b.is_active = TRUE`,
      [branch_id, username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid username or password.',
      });
    }

    const user = result.rows[0];

    const passwordOk = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordOk) {
      return res.status(401).json({
        error: 'Invalid username or password.',
      });
    }

    // ----------------------------------------------
    // DEMO TRIAL CHECK
    // Server/PostgreSQL time is authoritative.
    // Browser/PC clock cannot extend the trial.
    // ----------------------------------------------
    if (user.is_demo) {
      let expiresAt = user.demo_expires_at;

      // Safety for old/new demo branches which do not yet have
      // their trial timestamps.
      if (!expiresAt) {
        const trialResult = await pool.query(
          `UPDATE branches
           SET
             demo_started_at = COALESCE(demo_started_at, NOW()),
             demo_expires_at = COALESCE(
               demo_expires_at,
               COALESCE(demo_started_at, NOW()) + INTERVAL '3 days'
             )
           WHERE id = $1
           RETURNING demo_started_at, demo_expires_at`,
          [user.branch_id]
        );

        expiresAt = trialResult.rows[0]?.demo_expires_at;
      }

      const expiryResult = await pool.query(
        `SELECT NOW() >= $1::timestamptz AS expired`,
        [expiresAt]
      );

      if (expiryResult.rows[0]?.expired) {
        return res.status(403).json({
          error: DEMO_EXPIRED_MESSAGE,
          code: 'DEMO_TRIAL_EXPIRED',
          demoExpired: true,
          expiresAt,
        });
      }
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        branchId: user.branch_id,
        username: user.username,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '12h',
      }
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
        isDemo: user.is_demo,
        demoExpiresAt: user.demo_expires_at,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Login failed. Please try again.',
    });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { branch_id, username } = req.body;

  if (!branch_id || !username) {
    return res.status(400).json({
      error: 'branch_id and username are required.',
    });
  }

  try {
    const result = await pool.query(
      `SELECT
         u.name,
         u.username,
         b.name AS branch_name
       FROM users u
       JOIN branches b ON b.id = u.branch_id
       WHERE u.branch_id = $1
         AND u.username = $2
         AND u.is_active = TRUE`,
      [branch_id, username]
    );

    if (result.rows.length > 0) {
      const u = result.rows[0];

      try {
        await sendPasswordResetAlert({
          userName: u.name,
          username: u.username,
          branchName: u.branch_name,
        });
      } catch (mailErr) {
        console.error(
          'Failed to send password reset email:',
          mailErr.message
        );
      }
    }

    res.json({
      message:
        'If this account exists, your admin has been notified and will contact you with a new password.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Could not process request.',
    });
  }
});

// POST /api/auth/super-admin-login
router.post('/super-admin-login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: 'username and password are required.',
    });
  }

  try {
    const result = await pool.query(
      `SELECT
         id,
         name,
         username,
         password_hash,
         role
       FROM users
       WHERE branch_id IS NULL
         AND username = $1
         AND role = 'super_admin'
         AND is_active = TRUE`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid username or password.',
      });
    }

    const user = result.rows[0];

    const passwordOk = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordOk) {
      return res.status(401).json({
        error: 'Invalid username or password.',
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        branchId: null,
        username: user.username,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '12h',
      }
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
    res.status(500).json({
      error: 'Login failed. Please try again.',
    });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  logAction(
    req.user.userId,
    'logout',
    'user',
    req.user.userId
  );

  res.json({
    message: 'Logged out.',
  });
});

module.exports = router;