// local-db.js — SQLite wrapper (better-sqlite3) covering TWO needs:
//   1. simple get/set(key, value) — used by license-store.js / license-guard.js
//   2. generic insert/run/all/get(sql) — used by sync-engine.js for the
//      actual POS tables (sales, payments, sync_queue, etc.)
// Loads local-schema.sql on first run so all tables exist before use.

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class LocalDb {
  constructor(dbPath) {
    this.db = new Database(dbPath || path.join(__dirname, 'dms-local.db'));
    this.db.pragma('journal_mode = WAL'); // safer for a POS that writes constantly

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    const schemaPath = path.join(__dirname, 'local-schema.sql');
    if (fs.existsSync(schemaPath)) {
      this.db.exec(fs.readFileSync(schemaPath, 'utf8'));
    }

    this._getKvStmt = this.db.prepare('SELECT value FROM kv_store WHERE key = ?');
    this._setKvStmt = this.db.prepare(
      'INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    );
  }

  // --- simple key/value interface (license module) ---
  async get(key) {
    const row = this._getKvStmt.get(key);
    return row ? row.value : null;
  }

  async set(key, value) {
    this._setKvStmt.run(key, value);
    return true;
  }

  // --- generic relational interface (sync engine / POS tables) ---
  /** Insert a full record object into `table`. Columns must already exist in local-schema.sql. */
  async insert(table, record) {
    const columns = Object.keys(record);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    this.db.prepare(sql).run(...columns.map((c) => record[c]));
    return record;
  }

  /** Run an arbitrary write statement (UPDATE/INSERT/etc.) with positional params. */
  async run(sql, params = []) {
    return this.db.prepare(sql).run(...params);
  }

  /** Run a SELECT returning one row (or undefined). */
  async queryOne(sql, params = []) {
    return this.db.prepare(sql).get(...params);
  }

  /** Run a SELECT returning all matching rows. */
  async all(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }
}

module.exports = { LocalDb };
