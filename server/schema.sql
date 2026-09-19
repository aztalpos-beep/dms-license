-- DMS POS — Licensing & Trial schema (Cloud MySQL, authoritative source of truth)
-- Every "is this device allowed to run" decision is made HERE, never on the client.

CREATE TABLE IF NOT EXISTS devices (
    device_id       CHAR(36)      NOT NULL PRIMARY KEY,      -- UUID generated once, stored locally
    hw_fingerprint  CHAR(64)      NOT NULL,                  -- SHA-256 hash of disk serial + MAC + motherboard ID
    shop_id         CHAR(36)      NULL,                      -- linked once client buys / links to a shop account
    first_seen_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_hw_fingerprint (hw_fingerprint)             -- <-- stops "reinstall = new trial"
);

CREATE TABLE IF NOT EXISTS licenses (
    license_id      CHAR(36)      NOT NULL PRIMARY KEY,
    device_id       CHAR(36)      NOT NULL,
    shop_id         CHAR(36)      NULL,
    plan_type       ENUM('trial','paid','expired','blocked') NOT NULL DEFAULT 'trial',
    trial_started_at DATETIME     NULL,
    trial_days      INT           NOT NULL DEFAULT 3,
    paid_expiry_at  DATETIME      NULL,                       -- for paid subscriptions
    status          ENUM('active','expired','blocked') NOT NULL DEFAULT 'active',
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

-- Every time client "checks in", we log it. Lets us detect clock-rollback
-- and enforce "no contact for too long => lock" server-side reasoning too.
CREATE TABLE IF NOT EXISTS license_heartbeats (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    license_id      CHAR(36)      NOT NULL,
    device_id       CHAR(36)      NOT NULL,
    server_time     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- authoritative time, never trust client's
    client_claimed_time DATETIME  NULL,                                -- optional, only for anomaly logging
    ip_address      VARCHAR(45)   NULL,
    FOREIGN KEY (license_id) REFERENCES licenses(license_id)
);

CREATE INDEX idx_heartbeats_license ON license_heartbeats(license_id, server_time);

-- ============================================================
-- Sync tables — append-only + delta pattern, referenced by sync-api.js
-- Adapt column lists inside each table to your actual POS field sets;
-- record_id, device_id, synced_at are the fields sync-api.js depends on.
-- ============================================================

CREATE TABLE IF NOT EXISTS sales (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    record_id   CHAR(36) NOT NULL UNIQUE,   -- UUID generated on the device
    device_id   CHAR(36) NOT NULL,
    customer_id CHAR(36) NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    payload     JSON NULL,                  -- line items, discounts, etc. (flexible, adapt as needed)
    created_at  DATETIME NOT NULL,
    synced_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    record_id   CHAR(36) NOT NULL UNIQUE,
    device_id   CHAR(36) NOT NULL,
    sale_id     CHAR(36) NULL,
    amount      DECIMAL(12,2) NOT NULL,
    method      VARCHAR(30) NULL,
    created_at  DATETIME NOT NULL,
    synced_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    record_id   CHAR(36) NOT NULL UNIQUE,
    device_id   CHAR(36) NOT NULL,
    amount      DECIMAL(12,2) NOT NULL,
    reason      VARCHAR(255) NULL,
    created_at  DATETIME NOT NULL,
    synced_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cashbook_entries (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    record_id   CHAR(36) NOT NULL UNIQUE,
    device_id   CHAR(36) NOT NULL,
    amount      DECIMAL(12,2) NOT NULL,
    entry_type  ENUM('in','out') NOT NULL,
    note        VARCHAR(255) NULL,
    created_at  DATETIME NOT NULL,
    synced_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recoveries (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    record_id   CHAR(36) NOT NULL UNIQUE,
    device_id   CHAR(36) NOT NULL,
    customer_id CHAR(36) NULL,
    amount      DECIMAL(12,2) NOT NULL,
    created_at  DATETIME NOT NULL,
    synced_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- DELTA tables — never store an absolute "current stock" / "current balance".
-- Always compute it as SUM(delta) at read time. This is what makes
-- multi-device offline edits conflict-free.

CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    record_id   CHAR(36) NOT NULL UNIQUE,
    device_id   CHAR(36) NOT NULL,
    item_id     CHAR(36) NOT NULL,
    delta_qty   DECIMAL(12,3) NOT NULL,       -- negative for sale deduction, positive for stock-in
    reason      VARCHAR(100) NULL,
    created_at  DATETIME NOT NULL,
    synced_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_inv_adj_item ON inventory_adjustments(item_id);

CREATE TABLE IF NOT EXISTS customer_ledger (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    record_id   CHAR(36) NOT NULL UNIQUE,
    device_id   CHAR(36) NOT NULL,
    customer_id CHAR(36) NOT NULL,
    delta_amount DECIMAL(12,2) NOT NULL,      -- positive = customer owes more, negative = paid down
    reason      VARCHAR(100) NULL,
    created_at  DATETIME NOT NULL,
    synced_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_cust_ledger_customer ON customer_ledger(customer_id);

-- Example read-time computed views:
-- SELECT item_id, SUM(delta_qty) AS current_stock FROM inventory_adjustments GROUP BY item_id;
-- SELECT customer_id, SUM(delta_amount) AS current_balance FROM customer_ledger GROUP BY customer_id;
