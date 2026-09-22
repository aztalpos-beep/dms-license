const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const DEMO_EXPIRED_MESSAGE =
  'Your 3-day Demo ERP trial has expired. Please contact us to activate your account.';

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      error: 'Missing or invalid Authorization header.',
    });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = payload;

    // Super admin is not tied to a client/demo branch.
    if (
      payload.role !== 'super_admin' &&
      payload.branchId
    ) {
      const result = await pool.query(
        `SELECT
           is_demo,
           demo_expires_at,
           CASE
             WHEN is_demo = TRUE
              AND demo_expires_at IS NOT NULL
              AND NOW() >= demo_expires_at
             THEN TRUE
             ELSE FALSE
           END AS demo_expired
         FROM branches
         WHERE id = $1
         LIMIT 1`,
        [payload.branchId]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({
          error: 'Branch is no longer available.',
        });
      }

      const branch = result.rows[0];

      if (branch.demo_expired) {
        return res.status(403).json({
          error: DEMO_EXPIRED_MESSAGE,
          code: 'DEMO_TRIAL_EXPIRED',
          demoExpired: true,
          expiresAt: branch.demo_expires_at,
        });
      }
    }

    next();
  } catch (err) {
    if (
      err.name === 'JsonWebTokenError' ||
      err.name === 'TokenExpiredError' ||
      err.name === 'NotBeforeError'
    ) {
      return res.status(401).json({
        error: 'Invalid or expired token.',
      });
    }

    console.error('Authentication check failed:', err);

    return res.status(500).json({
      error: 'Could not verify account access.',
    });
  }
}

function enforceBranchScope(req, res, next) {
  if (req.user.role === 'super_admin') {
    return next();
  }

  const requestedBranchId =
    req.params.branchId ||
    req.body.branch_id ||
    req.query.branch_id;

  if (
    requestedBranchId &&
    Number(requestedBranchId) !==
      Number(req.user.branchId)
  ) {
    return res.status(403).json({
      error: 'You do not have access to this branch.',
    });
  }

  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error:
          'You do not have permission to perform this action.',
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  enforceBranchScope,
  requireRole,
};