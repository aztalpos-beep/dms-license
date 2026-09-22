const pool = require('./pool');

async function logAction(userId, action, entityType, entityId) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4)`,
      [userId || null, action, entityType || null, entityId || null]
    );
  } catch (err) {
    // Audit logging must never break the main request — just log to console.
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = { logAction };
