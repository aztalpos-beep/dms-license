-- Phase 1: Inventory Management

CREATE TABLE IF NOT EXISTS vendors (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    phone       TEXT,
    address     TEXT,
    branch_id   INTEGER NOT NULL REFERENCES branches(id),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Shared master inventory table across cars, tractors, and spare parts
CREATE TABLE IF NOT EXISTS inventory_items (
    id              SERIAL PRIMARY KEY,
    item_type       TEXT NOT NULL CHECK (item_type IN ('car', 'tractor', 'spare_part')),
    stock_code      TEXT NOT NULL,
    title           TEXT NOT NULL,
    vendor_id       INTEGER REFERENCES vendors(id),
    purchase_price  DECIMAL(14,2) NOT NULL,
    purchase_date   DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'in_stock'
                        CHECK (status IN ('in_stock', 'reserved', 'sold', 'returned')),
    branch_id       INTEGER NOT NULL REFERENCES branches(id),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- stock_code must be unique within a branch (not globally — two branches
-- can each run their own numbering without colliding)
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_branch_stockcode
    ON inventory_items (branch_id, stock_code);

CREATE INDEX IF NOT EXISTS idx_inventory_items_branch ON inventory_items (branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_status ON inventory_items (status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_type ON inventory_items (item_type);

CREATE TABLE IF NOT EXISTS inventory_vehicle_details (
    inventory_item_id  INTEGER PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
    vehicle_type       TEXT NOT NULL CHECK (vehicle_type IN ('car', 'tractor')),
    engine_no          TEXT,
    chassis_no         TEXT,
    registration_no    TEXT,
    model              TEXT,
    variant            TEXT,
    color              TEXT
);

CREATE TABLE IF NOT EXISTS inventory_spare_part_details (
    inventory_item_id  INTEGER PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
    part_no            TEXT,
    brand              TEXT,
    unit_type          TEXT,
    quantity_on_hand   INTEGER NOT NULL DEFAULT 0,
    reorder_level      INTEGER NOT NULL DEFAULT 0
);
