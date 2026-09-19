// sync-engine.js  (runs in Electron main / local-server process)
//
// Core rule: a Sale/Payment/Expense etc. is written to the LOCAL db FIRST,
// synchronously, and only THEN queued for cloud sync. The cashier's screen
// never waits on network — printing, stock deduction, receipt all happen
// off the local write, instantly, online or offline.

const { v4: uuidv4 } = require('uuid');

const APPEND_ONLY_TABLES = ['sales', 'payments', 'expenses', 'cashbook_entries', 'recoveries'];
const DELTA_TABLES = ['inventory_adjustments', 'customer_ledger'];

class SyncEngine {
  /**
   * @param {object} localDb - local SQLite wrapper with run/get/all methods
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
      const pending = await this.db.all(
        `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 50`
      );
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
          signal: AbortSignal.timeout(15000),
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
          await this.db.run(
            `UPDATE sync_queue SET status = 'synced', synced_at = ? WHERE record_id = ?`,
            [new Date().toISOString(), result.record_id]
          );
        } else {
          await this.db.run(
            `UPDATE sync_queue SET status = 'pending', attempts = attempts + 1, last_error = ? WHERE record_id = ?`,
            [result.error || 'unknown error', result.record_id]
          );
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
    const lastPullRow = await this.db.queryOne(`SELECT value FROM meta WHERE key = 'last_pull_at'`);
    const lastPull = lastPullRow?.value || new Date(0).toISOString();

    let response;
    try {
      response = await fetch(
        `${this.apiBase}/sync/pull?device_id=${this.deviceId}&since=${encodeURIComponent(lastPull)}`,
        { signal: AbortSignal.timeout(15000) }
      );
    } catch {
      return; // offline, skip silently — will retry on next scheduled pull
    }
    if (!response.ok) return;

    const { changes, server_time } = await response.json();
    for (const [table, rows] of Object.entries(changes)) {
      for (const row of rows) {
        // Idempotent local upsert by record_id (primary key in local-schema.sql).
        // Cloud row's extra columns (e.g. `id`, `synced_at`) are dropped if the
        // local table doesn't have them — only write columns that exist locally.
        const localColumns = (await this.db.all(`PRAGMA table_info(${table})`)).map((c) => c.name);
        const usableEntries = Object.entries(row).filter(([col]) => localColumns.includes(col));
        if (usableEntries.length === 0) continue;

        const columns = usableEntries.map(([col]) => col);
        const values = usableEntries.map(([, val]) => val);
        const placeholders = columns.map(() => '?').join(', ');
        const updateClause = columns
          .filter((c) => c !== 'record_id')
          .map((c) => `${c} = excluded.${c}`)
          .join(', ');

        await this.db.run(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
           ON CONFLICT(record_id) DO UPDATE SET ${updateClause}`,
          values
        );
      }
    }
    await this.db.run(
      `INSERT INTO meta (key, value) VALUES ('last_pull_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [server_time]
    );
  }

  /** Call once at app startup to wire a recurring background sync. */
  startBackgroundLoop(intervalMs = 30000) {
    setInterval(() => {
      this.processQueue().catch(() => {});
      this.pullRemoteChanges().catch(() => {});
    }, intervalMs);
  }
}

module.exports = { SyncEngine };
