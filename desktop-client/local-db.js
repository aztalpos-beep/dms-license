// local-db.js — JSON-file-backed local store. No native compilation needed
// (unlike better-sqlite3, which requires Visual Studio Build Tools on Windows).
//
// Covers TWO needs:
//   1. simple get/set(key, value)  — used by license-store.js / license-guard.js
//   2. a minimal table interface   — used by sync-engine.js for POS records
//
// This is intentionally simple (whole file rewritten on each write) — fine for
// a single-user desktop POS's data volume. If you later want a real relational
// engine, swap this file for better-sqlite3 once Visual Studio Build Tools (or
// the "Desktop development with C++" workload) is installed — nothing else
// needs to change, since license-guard.js / sync-engine.js only use the
// methods below (get/set/insert/run/all/queryOne).

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
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      } catch {
        return { kv: {}, tables: {} };
      }
    }
    return { kv: {}, tables: {} };
  }

  _save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
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

  // --- minimal table interface (sync engine / POS records) ---
  _table(name) {
    if (!this.data.tables[name]) this.data.tables[name] = [];
    return this.data.tables[name];
  }

  async insert(table, record) {
    this._table(table).push(record);
    this._save();
    return record;
  }

  async run(sql, params = []) {
    const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(\w+)\s*=\s*\?\s+WHERE\s+id\s*=\s*\?/i);
    if (updateMatch) {
      const [, table, col] = updateMatch;
      const [value, id] = params;
      const rows = this._table(table);
      const row = rows.find((r) => r.id === id);
      if (row) row[col] = value;
      this._save();
      return { changes: row ? 1 : 0 };
    }
    const deleteMatch = sql.match(/DELETE FROM\s+(\w+)\s+WHERE\s+id\s*=\s*\?/i);
    if (deleteMatch) {
      const [, table] = deleteMatch;
      const [id] = params;
      const before = this._table(table).length;
      this.data.tables[table] = this._table(table).filter((r) => r.id !== id);
      this._save();
      return { changes: before - this.data.tables[table].length };
    }
    throw new Error(`local-db.js: unsupported SQL pattern for run(): ${sql}`);
  }

  async queryOne(sql, params = []) {
    const match = sql.match(/FROM\s+(\w+)/i);
    if (!match) throw new Error(`local-db.js: unsupported SQL pattern for queryOne(): ${sql}`);
    const [id] = params;
    return this._table(match[1]).find((r) => r.id === id);
  }

  async all(sql, params = []) {
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) throw new Error(`local-db.js: unsupported SQL pattern for all(): ${sql}`);
    const rows = this._table(fromMatch[1]);
    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
    if (whereMatch && params.length) {
      const col = whereMatch[1];
      return rows.filter((r) => r[col] === params[0]);
    }
    return rows;
  }
}

module.exports = { LocalDb };
