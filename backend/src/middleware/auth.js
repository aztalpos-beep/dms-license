const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // payload shape: { userId, role, branchId, username }
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// Blocks cross-branch access. super_admin bypasses this check by design.
function enforceBranchScope(req, res, next) {
  if (req.user.role === 'super_admin') {
    return next();
  }

  const requestedBranchId = req.params.branchId || req.body.branch_id || req.query.branch_id;

  if (requestedBranchId && Number(requestedBranchId) !== Number(req.user.branchId)) {
    return res.status(403).json({ error: 'You do not have access to this branch.' });
  }

  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { requireAuth, enforceBranchScope, requireRole };
