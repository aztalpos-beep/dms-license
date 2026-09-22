require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');

async function run() {
  const client = await pool.connect();
  try {
    console.log('Deleting all branch data (customers, vendors, inventory, sales, expenses, cashbook)...');

    await client.query('BEGIN');

    await client.query(`
      TRUNCATE TABLE
        customers,
        vendors,
        inventory_items,
        expenses,
        daily_cashbook,
        sales
      RESTART IDENTITY CASCADE
    `);

    await client.query('COMMIT');
    console.log('Done. All branch data has been permanently deleted.');
    console.log('Branches and user accounts were not touched.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed — nothing was deleted:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
