// Run this from inside your backend/src/db folder (same place as pool.js):
//   node deleteCustomerPermanently.js "test"
//
// This PERMANENTLY deletes every customer whose name matches exactly
// (case-insensitive), but ONLY if that customer has no sales left in the
// system. If any sales still reference the customer, it is skipped and
// listed so you can delete those sales first (see
// deleteSalePermanently.js), then re-run this script.
//
// This cannot be undone unless you have a database backup.

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');

const customerName = process.argv[2];

async function run() {
  if (!customerName) {
    console.error('Usage: node deleteCustomerPermanently.js "<customer name>"');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const customersResult = await client.query(
      'SELECT * FROM customers WHERE LOWER(name) = LOWER($1)',
      [customerName]
    );

    if (customersResult.rows.length === 0) {
      console.log(`No customer found with the name "${customerName}".`);
      return;
    }

    console.log(`Found ${customersResult.rows.length} customer(s) named "${customerName}".`);

    for (const customer of customersResult.rows) {
      const salesResult = await client.query('SELECT receipt_no FROM sales WHERE customer_id = $1', [customer.id]);

      if (salesResult.rows.length > 0) {
        const receipts = salesResult.rows.map((r) => r.receipt_no).join(', ');
        console.log(`  Skipped customer #${customer.id} — still has ${salesResult.rows.length} sale(s): ${receipts}`);
        console.log('  Delete those sales first (deleteSalePermanently.js), then re-run this script.');
        continue;
      }

      await client.query('BEGIN');
      await client.query('DELETE FROM customer_ledger WHERE customer_id = $1', [customer.id]);
      await client.query('DELETE FROM customers WHERE id = $1', [customer.id]);
      await client.query('COMMIT');
      console.log(`  Deleted customer #${customer.id} (${customer.name}).`);
    }

    console.log('Done.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
