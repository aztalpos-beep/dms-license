-- Phase 2: Customer Management

CREATE TABLE IF NOT EXISTS customers (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    father_name   TEXT,          -- S/O
    nic           TEXT,
    address       TEXT,
    mobile_no     TEXT,
    picture_url   TEXT,
    branch_id     INTEGER NOT NULL REFERENCES branches(id),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_branch ON customers (branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers (mobile_no);
CREATE INDEX IF NOT EXISTS idx_customers_nic ON customers (nic);

-- Running debit/credit ledger. sale_id is nullable and left unconstrained
-- for now (the "sales" table doesn't exist yet — added in Phase 3).
-- entry_type = 'debit'  -> customer owes more (e.g. new sale)
-- entry_type = 'credit' -> customer paid / balance reduced
CREATE TABLE IF NOT EXISTS customer_ledger (
    id            SERIAL PRIMARY KEY,
    customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    sale_id       INTEGER,
    entry_type    TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    amount        DECIMAL(14,2) NOT NULL,
    description   TEXT,
    entry_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger (customer_id);
