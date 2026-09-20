// sync-engine.js  (runs in Electron main / local-server process)
//
// Core rule: a Sale/Payment/Expense etc. is written to the LOCAL db FIRST,
// synchronously, and only THEN queued for cloud sync. The cashier's screen
// never waits on network — printing, stock deduction, receipt all happen
// off the local write, instantly, online or offline.
//
// Uses local-db.js's plain JS methods (insert/findPending/updateByRecordId/
// upsertByRecordId/getAll/getMeta/setMeta) rather than SQL strings, so it
// works with the JSON-file store as-is (no native SQLite build required).

const { v4: uuidv4 } = require('uuid');

const APPEND_ONLY_TABLES = ['sales', 'payments', 'expenses', 'cashbook_entries', 'recoveries'];
const DELTA_TABLES = ['inventory_adjustments', 'customer_ledger'];
const SYNCABLE_TABLES = [...APPEND_ONLY_TABLES, ...DELTA_TABLES];

class SyncEngine {
  /**
   * @param {object} localDb - LocalDb instance (see local-db.js)
   * @param {string} deviceId
   * @param {string} apiBase
   */
  constructor(localDb, deviceId, apiBase) {
    this.db = localDb;
    this.deviceId = deviceId;
    this.apiBase = apiBase;
    this.isSyncing = false;
    this.retryDelayMs = 5000;
    this.maxRetryDelayMs = 5 * 60 * 1000;
  }

  /**
   * Called by the POS write path (createSale, recordPayment, adjustStock, ...).
   * Writes locally + enqueues for sync. Returns immediately after local write.
   */
  async writeAndQueue(table, record) {
    if (!SYNCABLE_TABLES.includes(table)) {
      throw new Error(`sync-engine: unknown table "${table}"`);
    }
    const record_id = record.record_id || uuidv4();
    const fullRecord = { ...record, record_id, device_id: this.deviceId, created_at: new Date().toISOString() };

    // 1. Local write — this is the ONLY thing the UI waits for.
    await this.db.insert(table, fullRecord);

    // 2. Enqueue for background sync (fire and forget from the caller's perspective).
    await this.db.insert('sync_queue', {
      record_id,
      table_name: table,
      payload: JSON.stringify(fullRecord),
      status: 'pending',
      attempts: 0,
      created_at: new Date().toISOString(),
    });

    // Kick the sync loop but don't await it — caller (POS UI) continues immediately.
    this.processQueue().catch(() => {});

    return fullRecord;
  }

  /** Background loop: attempts to push everything pending. Safe to call repeatedly/on a timer. */
  async processQueue() {
    if (this.isSyncing) return; // don't run overlapping sync passes
    this.isSyncing = true;
    try {
      const pending = await this.db.findPending('sync_queue', 'status', 'pending', 50);
      if (pending.length === 0) return;

      const transactions = pending.map((row) => ({
        table: row.table_name,
        op: 'insert',
        record_id: row.record_id,
        record: JSON.parse(row.payload),
      }));

      let response;
      try {
        response = await fetch(`${this.apiBase}/sync/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_id: this.deviceId, transactions }),
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        // No internet / server unreachable — leave queue as-is, try again later with backoff.
        this.retryDelayMs = Math.min(this.retryDelayMs * 2, this.maxRetryDelayMs);
        return;
      }

      if (!response.ok) {
        this.retryDelayMs = Math.min(this.retryDelayMs * 2, this.maxRetryDelayMs);
        return;
      }

      const { results } = await response.json();
      this.retryDelayMs = 5000; // reset backoff on success

      for (const result of results) {
        if (result.status === 'synced') {
          await this.db.updateByRecordId('sync_queue', result.record_id, {
            status: 'synced',
            synced_at: new Date().toISOString(),
          });
        } else {
          const row = pending.find((p) => p.record_id === result.record_id);
          await this.db.updateByRecordId('sync_queue', result.record_id, {
            status: 'pending',
            attempts: (row?.attempts || 0) + 1,
            last_error: result.error || 'unknown error',
          });
        }
      }

      // If we got a full page, immediately try the next batch.
      if (pending.length === 50) {
        setImmediate(() => this.processQueue().catch(() => {}));
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /** Pulls changes made by other devices/cloud dashboard since our last successful pull. */
  async pullRemoteChanges() {
    const lastPull = (await this.db.getMeta('last_pull_at')) || new Date(0).toISOString();

    let response;
    try {
      response = await fetch(
        `${this.apiBase}/sync/pull?device_id=${this.deviceId}&since=${encodeURIComponent(lastPull)}`,
        { signal: AbortSignal.timeout(20000) }
      );
    } catch {
      return; // offline, skip silently — will retry on next scheduled pull
    }
    if (!response.ok) return;

    const { changes, server_time } = await response.json();
    for (const [table, rows] of Object.entries(changes)) {
      for (const row of rows) {
        // Idempotent local upsert by record_id — safe even if we somehow see
        // the same remote change twice.
        await this.db.upsertByRecordId(table, row);
      }
    }
    await this.db.setMeta('last_pull_at', server_time);
  }

  /** Reads current computed stock for an item from local deltas (works fully offline). */
  async getLocalStock(itemId) {
    const rows = await this.db.getAll('inventory_adjustments');
    return rows.filter((r) => r.item_id === itemId).reduce((sum, r) => sum + Number(r.delta_qty), 0);
  }

  /** Reads current computed customer balance from local deltas (works fully offline). */
  async getLocalBalance(customerId) {
    const rows = await this.db.getAll('customer_ledger');
    return rows.filter((r) => r.customer_id === customerId).reduce((sum, r) => sum + Number(r.delta_amount), 0);
  }

  /** Call once at app startup to wire a recurring background sync. */
  startBackgroundLoop(intervalMs = 30000) {
    this.processQueue().catch(() => {});
    this.pullRemoteChanges().catch(() => {});
    setInterval(() => {
      this.processQueue().catch(() => {});
      this.pullRemoteChanges().catch(() => {});
    }, intervalMs);
  }
}

module.exports = { SyncEngine };
