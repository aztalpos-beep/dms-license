// db.js — thin wrapper around mysql2/promise pool.
// If your existing DMS backend already has a db module, just delete this file
// and change the `require('./db')` in license-api.js to point at yours —
// as long as it exposes an async `query(sql, params)` that returns rows.

const mysql = require('mysql2/promise');
const fs = require('fs');

function buildSslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined;
  if (process.env.CA_CERT_PATH && fs.existsSync(process.env.CA_CERT_PATH)) {
    return { ca: fs.readFileSync(process.env.CA_CERT_PATH, 'utf8') };
  }
  return { rejectUnauthorized: false }; // encrypted, CA not verified — set CA_CERT_PATH for production
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: buildSslConfig(), // Aiven needs SSL
  waitForConnections: true,
  connectionLimit: 10,
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = { query, pool };
