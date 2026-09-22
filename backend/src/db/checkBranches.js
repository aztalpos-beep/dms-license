// Run this from inside your backend/src/db folder (same place as pool.js):
//   node checkBranches.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');

async function run() {
  try {
    const result = await pool.query('SELECT id, name, location, address, phone FROM branches ORDER BY id');
    console.log('\nCurrent branches in database:\n');
    console.table(result.rows);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
