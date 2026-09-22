const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('super_admin'));

// ======================================================
// USERS
// ======================================================

// GET /api/admin/users?branch_id=
router.get('/users', async (req, res) => {
  try {
    const branchId = req.query.branch_id
      ? Number(req.query.branch_id)
      : null;

    const params = [];
    let whereClause = '';

    if (branchId) {
      params.push(branchId);
      whereClause = 'WHERE branch_id = $1';
    }

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        username,
        role,
        branch_id,
        is_active,
        created_at
      FROM users
      ${whereClause}
      ORDER BY branch_id, name
      `,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Load users error:', err);

    res.status(500).json({
      error: 'Could not load users.'
    });
  }
});


// POST /api/admin/users
// Body:
// {
//   name,
//   username,
//   password,
//   role,
//   branch_id
// }
router.post('/users', async (req, res) => {
  try {
    const {
      name,
      username,
      password,
      role,
      branch_id
    } = req.body;

    if (!name || !username || !password || !role) {
      return res.status(400).json({
        error:
          'name, username, password, and role are required.'
      });
    }

    if (role === 'super_admin') {
      return res.status(403).json({
        error:
          'super_admin accounts cannot be created through this screen.'
      });
    }

    if (!branch_id) {
      return res.status(400).json({
        error: 'branch_id is required.'
      });
    }

    const branchId = Number(branch_id);

    if (!Number.isInteger(branchId) || branchId <= 0) {
      return res.status(400).json({
        error: 'Invalid branch_id.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters.'
      });
    }

    const branchCheck = await pool.query(
      `
      SELECT id
      FROM branches
      WHERE id = $1
      `,
      [branchId]
    );

    if (branchCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Branch not found.'
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (
        name,
        username,
        password_hash,
        role,
        branch_id
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        name,
        username,
        role,
        branch_id,
        is_active
      `,
      [
        name.trim(),
        username.trim(),
        hash,
        role,
        branchId
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    const status =
      err.code === '23505'
        ? 409
        : 500;

    const message =
      err.code === '23505'
        ? 'That username already exists in this branch.'
        : 'Could not create user.';

    console.error('Create user error:', err);

    res.status(status).json({
      error: message
    });
  }
});


// PUT /api/admin/users/:id
// Toggle active / change role / change name
router.put('/users/:id', async (req, res) => {
  try {
    const existing = await pool.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
      `,
      [req.params.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found.'
      });
    }

    const target = existing.rows[0];

    if (target.role === 'super_admin') {
      return res.status(403).json({
        error:
          'super_admin accounts cannot be edited here.'
      });
    }

    const {
      name,
      role,
      is_active
    } = req.body;

    await pool.query(
      `
      UPDATE users
      SET
        name = COALESCE($1, name),
        role = COALESCE($2, role),
        is_active = COALESCE($3, is_active)
      WHERE id = $4
      `,
      [
        name,
        role,
        is_active,
        req.params.id
      ]
    );

    res.json({
      message: 'User updated.'
    });
  } catch (err) {
    console.error('Update user error:', err);

    res.status(500).json({
      error: 'Could not update user.'
    });
  }
});


// PUT /api/admin/users/:id/password
// Body: { password }
router.put('/users/:id/password', async (req, res) => {
  try {
    const existing = await pool.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
      `,
      [req.params.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found.'
      });
    }

    const target = existing.rows[0];

    if (
      target.role === 'super_admin' &&
      req.user.userId !== target.id
    ) {
      return res.status(403).json({
        error:
          'super_admin accounts cannot be edited here.'
      });
    }

    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        error:
          'Password must be at least 6 characters.'
      });
    }

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
      `,
      [
        hash,
        req.params.id
      ]
    );

    res.json({
      message: 'Password updated.'
    });
  } catch (err) {
    console.error('Update password error:', err);

    res.status(500).json({
      error: 'Could not update password.'
    });
  }
});


// ======================================================
// BRANCHES
// ======================================================

// GET /api/admin/branches
router.get('/branches', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM branches
      ORDER BY id
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Load branches error:', err);

    res.status(500).json({
      error: 'Could not load branches.'
    });
  }
});


// POST /api/admin/branches
router.post('/branches', async (req, res) => {
  try {
    const {
      name,
      location,
      address,
      phone
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: 'Branch name is required.'
      });
    }

    const result = await pool.query(
      `
      INSERT INTO branches (
        name,
        location,
        address,
        phone
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [
        name.trim(),
        location || null,
        address || null,
        phone || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create branch error:', err);

    res.status(500).json({
      error: 'Could not create branch.'
    });
  }
});


// PUT /api/admin/branches/:id
router.put('/branches/:id', async (req, res) => {
  try {
    const {
      name,
      location,
      address,
      phone,
      is_active
    } = req.body;

    const result = await pool.query(
      `
      UPDATE branches
      SET
        name = COALESCE($1, name),
        location = COALESCE($2, location),
        address = COALESCE($3, address),
        phone = COALESCE($4, phone),
        is_active = COALESCE($5, is_active)
      WHERE id = $6
      RETURNING *
      `,
      [
        name,
        location,
        address,
        phone,
        is_active,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Branch not found.'
      });
    }

    res.json({
      message: 'Branch updated.',
      branch: result.rows[0]
    });
  } catch (err) {
    console.error('Update branch error:', err);

    res.status(500).json({
      error: 'Could not update branch.'
    });
  }
});


// ======================================================
// DEMO CLIENTS
// ======================================================

// GET /api/admin/demo-clients
//
// Returns every demo workspace and its first manager account.
router.get('/demo-clients', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        b.id,
        b.name,
        b.location,
        b.address,
        b.phone,
        b.is_active,
        b.is_demo,
        b.demo_started_at,
        b.demo_expires_at,

        CASE
          WHEN b.is_active = FALSE
            THEN 'disabled'

          WHEN b.demo_expires_at IS NOT NULL
               AND b.demo_expires_at <= NOW()
            THEN 'expired'

          ELSE 'active'
        END AS trial_status,

        CASE
          WHEN b.demo_expires_at IS NULL
            THEN 0

          ELSE GREATEST(
            0,
            CEIL(
              EXTRACT(
                EPOCH FROM (
                  b.demo_expires_at - NOW()
                )
              ) / 86400.0
            )
          )::int
        END AS days_remaining,

        u.id AS manager_user_id,
        u.name AS manager_name,
        u.username AS manager_username,
        u.is_active AS manager_is_active

      FROM branches b

      LEFT JOIN LATERAL (
        SELECT
          id,
          name,
          username,
          is_active
        FROM users
        WHERE branch_id = b.id
          AND role = 'manager'
        ORDER BY id ASC
        LIMIT 1
      ) u ON TRUE

      WHERE b.is_demo = TRUE

      ORDER BY b.id DESC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error(
      'Load demo clients error:',
      err
    );

    res.status(500).json({
      error:
        'Could not load demo clients.'
    });
  }
});


// POST /api/admin/demo-clients
//
// Creates a complete isolated demo client:
//
// 1. Demo branch/workspace
// 2. Independent trial timer
// 3. Manager account
//
// Body:
// {
//   business_name,
//   owner_name,
//   phone,
//   city,
//   username,
//   password,
//   trial_days
// }
router.post('/demo-clients', async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      business_name,
      owner_name,
      phone,
      city,
      username,
      password,
      trial_days
    } = req.body;

    const businessName =
      typeof business_name === 'string'
        ? business_name.trim()
        : '';

    const ownerName =
      typeof owner_name === 'string'
        ? owner_name.trim()
        : '';

    const cleanPhone =
      typeof phone === 'string'
        ? phone.trim()
        : '';

    const cleanCity =
      typeof city === 'string'
        ? city.trim()
        : '';

    const cleanUsername =
      typeof username === 'string'
        ? username.trim()
        : '';

    if (
      !businessName ||
      !ownerName ||
      !cleanUsername ||
      !password
    ) {
      return res.status(400).json({
        error:
          'Business name, owner name, username and password are required.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error:
          'Password must be at least 6 characters.'
      });
    }

    // Default demo trial = 3 days.
    const requestedDays =
      trial_days === undefined ||
      trial_days === null ||
      trial_days === ''
        ? 3
        : Number(trial_days);

    if (
      !Number.isInteger(requestedDays) ||
      requestedDays < 1 ||
      requestedDays > 30
    ) {
      return res.status(400).json({
        error:
          'Trial days must be between 1 and 30.'
      });
    }

    await client.query('BEGIN');

    // --------------------------------------------------
    // CREATE ISOLATED DEMO BRANCH
    // --------------------------------------------------

    const branchResult =
      await client.query(
        `
        INSERT INTO branches (
          name,
          location,
          address,
          phone,
          is_active,
          is_demo,
          demo_started_at,
          demo_expires_at
        )
        VALUES (
          $1,
          $2,
          NULL,
          $3,
          TRUE,
          TRUE,
          NOW(),
          NOW() + ($4 * INTERVAL '1 day')
        )
        RETURNING
          id,
          name,
          location,
          address,
          phone,
          is_active,
          is_demo,
          demo_started_at,
          demo_expires_at
        `,
        [
          businessName,
          cleanCity || null,
          cleanPhone || null,
          requestedDays
        ]
      );

    const branch =
      branchResult.rows[0];

    // --------------------------------------------------
    // CREATE MANAGER ACCOUNT
    // --------------------------------------------------

    const passwordHash =
      await bcrypt.hash(
        password,
        10
      );

    const userResult =
      await client.query(
        `
        INSERT INTO users (
          name,
          username,
          password_hash,
          role,
          branch_id,
          is_active
        )
        VALUES (
          $1,
          $2,
          $3,
          'manager',
          $4,
          TRUE
        )
        RETURNING
          id,
          name,
          username,
          role,
          branch_id,
          is_active
        `,
        [
          ownerName,
          cleanUsername,
          passwordHash,
          branch.id
        ]
      );

    const manager =
      userResult.rows[0];

    await client.query('COMMIT');

    // Password is intentionally NOT returned.
    res.status(201).json({
      message:
        'Demo client created successfully.',

      demo: {
        branch_id:
          branch.id,

        business_name:
          branch.name,

        city:
          branch.location,

        phone:
          branch.phone,

        is_active:
          branch.is_active,

        demo_started_at:
          branch.demo_started_at,

        demo_expires_at:
          branch.demo_expires_at,

        trial_days:
          requestedDays,

        status:
          'active',

        login_path:
          `/login/${branch.id}`,

        manager: {
          id:
            manager.id,

          name:
            manager.name,

          username:
            manager.username,

          role:
            manager.role
        }
      }
    });

  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error(
        'Demo client rollback error:',
        rollbackErr
      );
    }

    console.error(
      'Create demo client error:',
      err
    );

    if (err.code === '23505') {
      return res.status(409).json({
        error:
          'A conflicting username or record already exists.'
      });
    }

    res.status(500).json({
      error:
        'Could not create demo client.'
    });

  } finally {
    client.release();
  }
});


// POST /api/admin/demo-clients/:id/extend
//
// Body:
// {
//   days: 3
// }
//
// If trial is still active:
// existing expiry + days
//
// If trial is expired:
// NOW() + days
router.post(
  '/demo-clients/:id/extend',
  async (req, res) => {
    try {
      const branchId =
        Number(req.params.id);

      const days =
        req.body.days === undefined ||
        req.body.days === null ||
        req.body.days === ''
          ? 3
          : Number(req.body.days);

      if (
        !Number.isInteger(branchId) ||
        branchId <= 0
      ) {
        return res.status(400).json({
          error:
            'Invalid demo client.'
        });
      }

      if (
        !Number.isInteger(days) ||
        days < 1 ||
        days > 30
      ) {
        return res.status(400).json({
          error:
            'Extension must be between 1 and 30 days.'
        });
      }

      const result =
        await pool.query(
          `
          UPDATE branches
          SET
            is_active = TRUE,

            demo_expires_at =
              CASE
                WHEN demo_expires_at IS NULL
                  OR demo_expires_at <= NOW()

                THEN
                  NOW() +
                  ($1 * INTERVAL '1 day')

                ELSE
                  demo_expires_at +
                  ($1 * INTERVAL '1 day')
              END

          WHERE id = $2
            AND is_demo = TRUE

          RETURNING
            id,
            name,
            location,
            phone,
            is_active,
            is_demo,
            demo_started_at,
            demo_expires_at
          `,
          [
            days,
            branchId
          ]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Demo client not found.'
        });
      }

      // If the workspace had previously been manually
      // disabled, re-enable its users when extending.
      await pool.query(
        `
        UPDATE users
        SET is_active = TRUE
        WHERE branch_id = $1
          AND role <> 'super_admin'
        `,
        [branchId]
      );

      res.json({
        message:
          `Demo trial extended by ${days} day(s).`,

        demo:
          result.rows[0]
      });

    } catch (err) {
      console.error(
        'Extend demo trial error:',
        err
      );

      res.status(500).json({
        error:
          'Could not extend demo trial.'
      });
    }
  }
);


// PUT /api/admin/demo-clients/:id/status
//
// Body:
// {
//   is_active: true
// }
//
// or
//
// {
//   is_active: false
// }
router.put(
  '/demo-clients/:id/status',
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const branchId =
        Number(req.params.id);

      if (
        !Number.isInteger(branchId) ||
        branchId <= 0
      ) {
        return res.status(400).json({
          error:
            'Invalid demo client.'
        });
      }

      if (
        typeof req.body.is_active !==
        'boolean'
      ) {
        return res.status(400).json({
          error:
            'is_active must be true or false.'
        });
      }

      await client.query('BEGIN');

      const result =
        await client.query(
          `
          UPDATE branches
          SET is_active = $1
          WHERE id = $2
            AND is_demo = TRUE
          RETURNING
            id,
            name,
            location,
            phone,
            is_active,
            demo_started_at,
            demo_expires_at
          `,
          [
            req.body.is_active,
            branchId
          ]
        );

      if (
        result.rows.length === 0
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Demo client not found.'
        });
      }

      // Disable/enable all users belonging
      // to this demo workspace.
      await client.query(
        `
        UPDATE users
        SET is_active = $1
        WHERE branch_id = $2
        `,
        [
          req.body.is_active,
          branchId
        ]
      );

      await client.query('COMMIT');

      res.json({
        message:
          req.body.is_active
            ? 'Demo client enabled.'
            : 'Demo client disabled.',

        demo:
          result.rows[0]
      });

    } catch (err) {
      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (rollbackErr) {
        console.error(
          'Demo status rollback error:',
          rollbackErr
        );
      }

      console.error(
        'Demo status update error:',
        err
      );

      res.status(500).json({
        error:
          'Could not update demo client.'
      });

    } finally {
      client.release();
    }
  }
);


// ======================================================
// AUDIT LOG
// ======================================================

// GET /api/admin/audit-log
router.get(
  '/audit-log',
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            a.*,
            u.name AS user_name,
            u.branch_id
          FROM audit_log a
          LEFT JOIN users u
            ON u.id = a.user_id
          ORDER BY a.created_at DESC
          LIMIT 200
          `
        );

      res.json(result.rows);
    } catch (err) {
      console.error(
        'Load audit log error:',
        err
      );

      res.status(500).json({
        error:
          'Could not load audit log.'
      });
    }
  }
);


module.exports = router;