// Run this from inside your backend/src/db folder (same place as pool.js):
//   node deleteSalePermanently.js <receipt_no_1> <receipt_no_2> <receipt_no_3> ...
//
// Example (delete several at once):
//   node deleteSalePermanently.js 1211 2222 1212121 1112 1111 1234
//
// This PERMANENTLY and completely removes each sale and everything linked
// to it: sale_items, sale_payment_plan, sale_documents, sale_payments,
// customer_ledger entries, and any returns record. Each sale is deleted
// in its own transaction, so if one fails the others still proceed.
//
// This cannot be undone unless you have a database backup.

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');

const receiptNumbers = process.argv.slice(2);

async function deleteOne(receiptNo) {
  const client = await pool.connect();
  try {
    const saleResult = await client.query('SELECT * FROM sales WHERE receipt_no = $1', [receiptNo]);
    if (saleResult.rows.length === 0) {
      console.log(`  Skipped "${receiptNo}" — no sale found with that receipt number.`);
      return;
    }
    const sale = saleResult.rows[0];

    await client.query('BEGIN');
    await client.query('DELETE FROM sale_documents WHERE sale_id = $1', [sale.id]);
    await client.query('DELETE FROM sale_payment_plan WHERE sale_id = $1', [sale.id]);
    await client.query('DELETE FROM sale_payments WHERE sale_id = $1', [sale.id]);
    await client.query('DELETE FROM returns WHERE sale_id = $1', [sale.id]);
    await client.query('DELETE FROM customer_ledger WHERE sale_id = $1', [sale.id]);
    await client.query('DELETE FROM sale_items WHERE sale_id = $1', [sale.id]);
    await client.query('DELETE FROM sales WHERE id = $1', [sale.id]);
    await client.query('COMMIT');

    console.log(`  Deleted sale #${sale.id} (receipt ${receiptNo}, was: ${sale.status}).`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`  Failed on "${receiptNo}":`, err.message);
  } finally {
    client.release();
  }
}

async function run() {
  if (receiptNumbers.length === 0) {
    console.error('Usage: node deleteSalePermanently.js <receipt_no_1> <receipt_no_2> ...');
    process.exit(1);
  }

  console.log(`Deleting ${receiptNumbers.length} sale(s)...`);
  for (const receiptNo of receiptNumbers) {
    await deleteOne(receiptNo);
  }
  console.log('Done.');
  await pool.end();
}

run();
