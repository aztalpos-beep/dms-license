// Run this from inside your backend/src/db folder (same place as pool.js):
//   node updateBranch3.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');

async function run() {
  try {
    const result = await pool.query(
      `UPDATE branches SET name = $1, location = $2 WHERE id = 3 RETURNING *`,
      ['Yazman Motors Bahawalpur', 'Bahawalpur']
    );
    console.log('\nUpdated branch:\n');
    console.table(result.rows);

    const all = await pool.query('SELECT id, name, location FROM branches ORDER BY id');
    console.log('\nAll branches now:\n');
    console.table(all.rows);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
