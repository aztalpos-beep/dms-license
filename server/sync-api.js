// sync-api.js
// Server side of the sync engine. Client pushes a batch of local transactions
// (sales, payments, expenses, etc.) that happened while offline (or just to
// stay current). Server writes them idempotently and reports back which ones
// landed vs which had a conflict, using the append-only + delta-based rules
// discussed: appended rows dedupe by UUID; stock/balances apply as deltas.

const express = require('express');
const db = require('./db');
const router = express.Router();

// Same safety net as license-api.js — prevents an unguarded route from
// crashing the whole server process on a transient DB error.
function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((err) => {
      console.error('[sync-api] error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
    });
  };
}

/**
 * POST /sync/push
 * body: {
 *   device_id: string,
 *   transactions: [
 *     { table: 'sales', op: 'insert', record: {...}, record_id: UUID },
 *     { table: 'inventory_adjustments', op: 'insert', record: { item_id, delta_qty, ... }, record_id: UUID },
 *     ...
 *   ]
 * }
 */
router.post('/sync/push', asyncRoute(async (req, res) => {
  const { device_id, transactions } = req.body;
  if (!device_id || !Array.isArray(transactions)) {
    return res.status(400).json({ error: 'device_id and transactions[] required' });
  }

  const results = [];

  for (const tx of transactions) {
    try {
      const result = await applyTransaction(device_id, tx);
      results.push({ record_id: tx.record_id, status: 'synced', ...result });
    } catch (err) {
      results.push({ record_id: tx.record_id, status: 'error', error: err.message });
    }
  }

  res.json({ results, server_time: new Date().toISOString() });
}));

async function applyTransaction(device_id, tx) {
  const { table, op, record, record_id } = tx;

  // Append-only tables: Sale, Payment, Expense, Cashbook entries.
  // Idempotent insert — if this UUID already exists (e.g. client retried after
  // a dropped response), we don't duplicate it, we just confirm it's synced.
  const APPEND_ONLY_TABLES = ['sales', 'payments', 'expenses', 'cashbook_entries', 'recoveries'];

  if (APPEND_ONLY_TABLES.includes(table) && op === 'insert') {
    const existing = await db.query(`SELECT id FROM ${table} WHERE record_id = ?`, [record_id]);
    if (existing.length > 0) {
      return { note: 'already existed, no-op (idempotent retry)' };
    }
    const columns = Object.keys(record);
    const placeholders = columns.map(() => '?').join(', ');
    await db.query(
      `INSERT INTO ${table} (record_id, device_id, ${columns.join(', ')}, synced_at)
       VALUES (?, ?, ${placeholders}, NOW())`,
      [record_id, device_id, ...columns.map((c) => record[c])]
    );
    return { note: 'inserted' };
  }

  // Delta-based tables: inventory stock, customer running balance.
  // These NEVER overwrite an absolute value — they add a signed delta row,
  // so two devices adjusting the same item offline both apply cleanly with
  // no lost update, regardless of order.
  const DELTA_TABLES = ['inventory_adjustments', 'customer_ledger'];

  if (DELTA_TABLES.includes(table) && op === 'insert') {
    const existing = await db.query(`SELECT id FROM ${table} WHERE record_id = ?`, [record_id]);
    if (existing.length > 0) {
      return { note: 'already existed, no-op (idempotent retry)' };
    }
    const columns = Object.keys(record); // expect e.g. item_id, delta_qty, reason
    const placeholders = columns.map(() => '?').join(', ');
    await db.query(
      `INSERT INTO ${table} (record_id, device_id, ${columns.join(', ')}, synced_at)
       VALUES (?, ?, ${placeholders}, NOW())`,
      [record_id, device_id, ...columns.map((c) => record[c])]
    );
    // Current stock/balance is always COMPUTED as SUM(delta) on read,
    // e.g.: SELECT SUM(delta_qty) FROM inventory_adjustments WHERE item_id = ?
    // Never store a mutable "current_stock" column that two devices could race on.
    return { note: 'delta applied' };
  }

  throw new Error(`Unhandled table/op combination: ${table}/${op}`);
}

/**
 * GET /sync/pull?device_id=...&since=ISO_TIMESTAMP
 * Returns changes from OTHER devices (or the cloud dashboard) that this
 * device hasn't seen yet, so multi-PC / cloud-initiated changes flow back down.
 */
router.get('/sync/pull', asyncRoute(async (req, res) => {
  const { device_id, since } = req.query;
  if (!device_id || !since) return res.status(400).json({ error: 'device_id and since required' });

  const tables = ['sales', 'payments', 'expenses', 'cashbook_entries', 'recoveries', 'inventory_adjustments', 'customer_ledger'];
  const changes = {};

  for (const table of tables) {
    changes[table] = await db.query(
      `SELECT * FROM ${table} WHERE synced_at > ? AND device_id != ? ORDER BY synced_at ASC LIMIT 500`,
      [since, device_id]
    );
  }

  res.json({ changes, server_time: new Date().toISOString() });
}));

module.exports = router;
