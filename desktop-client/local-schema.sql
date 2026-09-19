-- local-schema.sql — SQLite, lives on each PC / local server
-- Mirrors the append-only + delta tables from cloud schema.sql so the app
-- can read/write locally exactly the same shape, offline or online.

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS sync_queue (
    record_id   TEXT PRIMARY KEY,
    table_name  TEXT NOT NULL,
    payload     TEXT NOT NULL,        -- JSON blob of the full record
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | synced
    attempts    INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT,
    created_at  TEXT NOT NULL,
    synced_at   TEXT
);

CREATE TABLE IF NOT EXISTS sales (
    record_id    TEXT PRIMARY KEY,
    device_id    TEXT NOT NULL,
    customer_id  TEXT,
    total_amount REAL NOT NULL,
    payload      TEXT,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
    record_id  TEXT PRIMARY KEY,
    device_id  TEXT NOT NULL,
    sale_id    TEXT,
    amount     REAL NOT NULL,
    method     TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
    record_id  TEXT PRIMARY KEY,
    device_id  TEXT NOT NULL,
    amount     REAL NOT NULL,
    reason     TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cashbook_entries (
    record_id  TEXT PRIMARY KEY,
    device_id  TEXT NOT NULL,
    amount     REAL NOT NULL,
    entry_type TEXT NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recoveries (
    record_id   TEXT PRIMARY KEY,
    device_id   TEXT NOT NULL,
    customer_id TEXT,
    amount      REAL NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_adjustments (
    record_id  TEXT PRIMARY KEY,
    device_id  TEXT NOT NULL,
    item_id    TEXT NOT NULL,
    delta_qty  REAL NOT NULL,
    reason     TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_ledger (
    record_id    TEXT PRIMARY KEY,
    device_id    TEXT NOT NULL,
    customer_id  TEXT NOT NULL,
    delta_amount REAL NOT NULL,
    reason       TEXT,
    created_at   TEXT NOT NULL
);

-- Local reads use the same SUM(delta) pattern as cloud:
-- SELECT item_id, SUM(delta_qty) AS current_stock FROM inventory_adjustments GROUP BY item_id;
