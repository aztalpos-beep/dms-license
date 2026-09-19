// run-schema.js — runs schema.sql against the DB configured in .env.
// Use this when the `mysql` CLI isn't installed and there's no query editor
// available in the cloud console.
//
// Usage:  node scripts/run-schema.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function buildSslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined;

  // Preferred: verify against Aiven's actual CA certificate (download it from
  // the Aiven console's "Connection information" page, "CA certificate" ->
  // Show/Download, save as ca.pem next to this script or wherever CA_CERT_PATH points).
  if (process.env.CA_CERT_PATH && fs.existsSync(process.env.CA_CERT_PATH)) {
    return { ca: fs.readFileSync(process.env.CA_CERT_PATH, 'utf8') };
  }

  // Fallback: encrypts the connection but does not verify the CA chain.
  // Fine to unblock local development today; switch to CA_CERT_PATH before
  // this ever runs anywhere that matters (Render/production).
  console.warn('⚠️  No CA_CERT_PATH set — connecting with rejectUnauthorized: false (encrypted, not verified).');
  return { rejectUnauthorized: false };
}

async function main() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: buildSslConfig(),
    multipleStatements: true, // needed to run the whole .sql file in one go
  });

  console.log(`Connected to ${process.env.DB_HOST}/${process.env.DB_NAME}. Running schema.sql ...`);

  try {
    await connection.query(sql);
    console.log('✅ Schema applied successfully.');
  } catch (err) {
    console.error('❌ Error applying schema:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
