-- Phase 3: Sales / POS

CREATE TABLE IF NOT EXISTS sales (
    id                   SERIAL PRIMARY KEY,
    receipt_no           TEXT NOT NULL,
    customer_id          INTEGER NOT NULL REFERENCES customers(id),
    sale_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal             DECIMAL(14,2) NOT NULL DEFAULT 0,
    discount             DECIMAL(14,2) NOT NULL DEFAULT 0,   -- applied post-slip, requires manager approval
    discount_approved_by INTEGER REFERENCES users(id),
    total_amount         DECIMAL(14,2) NOT NULL DEFAULT 0,   -- subtotal - discount
    advance_received     DECIMAL(14,2) NOT NULL DEFAULT 0,
    outstanding_balance  DECIMAL(14,2) NOT NULL DEFAULT 0,   -- cached; recalculated on payment
    status               TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'completed', 'returned', 'cancelled')),
    branch_id            INTEGER NOT NULL REFERENCES branches(id),
    created_by           INTEGER REFERENCES users(id),
    created_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_branch_receipt ON sales (branch_id, receipt_no);
CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales (branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales (customer_id);

-- One row per line item. A vehicle sale = exactly one row (quantity 1).
-- A spare-parts sale = one row per part (multi-item cart).
CREATE TABLE IF NOT EXISTS sale_items (
    id                  SERIAL PRIMARY KEY,
    sale_id             INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    inventory_item_id   INTEGER NOT NULL REFERENCES inventory_items(id),
    quantity            INTEGER NOT NULL DEFAULT 1,
    unit_price           DECIMAL(14,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items (sale_id);

-- Proposed installment schedule
CREATE TABLE IF NOT EXISTS sale_payment_plan (
    id                SERIAL PRIMARY KEY,
    sale_id           INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    installment_no    INTEGER NOT NULL,
    due_date          DATE NOT NULL,
    expected_amount   DECIMAL(14,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_plan_sale ON sale_payment_plan (sale_id);

CREATE TABLE IF NOT EXISTS sale_documents (
    id            SERIAL PRIMARY KEY,
    sale_id       INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    document_type TEXT,
    file_url      TEXT NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
