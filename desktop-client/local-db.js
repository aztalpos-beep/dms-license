// local-db.js — JSON-file-backed local store. No native compilation needed
// (unlike better-sqlite3, which requires Visual Studio Build Tools on Windows).
//
// Provides plain JS methods (no SQL strings) used by:
//   - license-store.js / license-guard.js  -> get(key) / set(key, value)
//   - sync-engine.js                       -> insert / findPending / updateByRecordId /
//                                              upsertByRecordId / getAll / getMeta / setMeta
//
// If you later move to a real relational engine (better-sqlite3, once Visual
// Studio Build Tools are installed), keep these exact method names/shapes and
// nothing else in license-guard.js or sync-engine.js needs to change.

const fs = require('fs');
const path = require('path');

class LocalDb {
  constructor(dbPath) {
    this.filePath = dbPath || path.join(__dirname, 'dms-local.json');
    this.data = this._load();
  }

  _load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        return { kv: {}, meta: {}, tables: {}, ...parsed };
      } catch {
        return { kv: {}, meta: {}, tables: {} }; // corrupted file — start fresh rather than crash
      }
    }
    return { kv: {}, meta: {}, tables: {} };
  }

  _save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  _table(name) {
    if (!this.data.tables[name]) this.data.tables[name] = [];
    return this.data.tables[name];
  }

  // --- simple key/value interface (license module) ---
  async get(key) {
    return Object.prototype.hasOwnProperty.call(this.data.kv, key) ? this.data.kv[key] : null;
  }

  async set(key, value) {
    this.data.kv[key] = value;
    this._save();
    return true;
  }

  // --- small separate namespace for sync-engine bookkeeping (last_pull_at etc.) ---
  async getMeta(key) {
    return Object.prototype.hasOwnProperty.call(this.data.meta, key) ? this.data.meta[key] : null;
  }

  async setMeta(key, value) {
    this.data.meta[key] = value;
    this._save();
    return true;
  }

  // --- table interface (POS records + sync queue) ---

  /** Insert a full record object into `table`. */
  async insert(table, record) {
    this._table(table).push(record);
    this._save();
    return record;
  }

  /** All rows currently in `table`, in insertion order. */
  async getAll(table) {
    return [...this._table(table)];
  }

  /**
   * Rows where row[field] === value, oldest-first by created_at, capped at limit.
   * (Mirrors: SELECT * FROM table WHERE field = value ORDER BY created_at ASC LIMIT limit)
   */
  async findPending(table, field, value, limit = 50) {
    return this._table(table)
      .filter((r) => r[field] === value)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(0, limit);
  }

  /** Merge `updates` into the row matching record_id. Returns true if a row was updated. */
  async updateByRecordId(table, record_id, updates) {
    const row = this._table(table).find((r) => r.record_id === record_id);
    if (!row) return false;
    Object.assign(row, updates);
    this._save();
    return true;
  }

  /**
   * Insert `record` if no row with the same record_id exists yet, otherwise
   * merge the new fields into the existing row. Used when pulling changes
   * made by other devices/the cloud — safe to apply the same change twice.
   */
  async upsertByRecordId(table, record) {
    const rows = this._table(table);
    const existing = rows.find((r) => r.record_id === record.record_id);
    if (existing) {
      Object.assign(existing, record);
    } else {
      rows.push(record);
    }
    this._save();
    return record;
  }
}

module.exports = { LocalDb };
