-- Phase 7: Daily Cash Ledger

CREATE TABLE IF NOT EXISTS daily_cashbook (
    id                SERIAL PRIMARY KEY,
    branch_id         INTEGER NOT NULL REFERENCES branches(id),
    ledger_date       DATE NOT NULL,
    opening_cash      DECIMAL(14,2) NOT NULL DEFAULT 0,
    cash_in_sales     DECIMAL(14,2) NOT NULL DEFAULT 0,  -- advance received on new sales that day
    cash_in_recovery  DECIMAL(14,2) NOT NULL DEFAULT 0,  -- payments recorded against existing sales that day
    cash_in_other     DECIMAL(14,2) NOT NULL DEFAULT 0,  -- manual entry (misc income)
    cash_out_expenses DECIMAL(14,2) NOT NULL DEFAULT 0,  -- approved expenses dated that day
    cash_out_refunds  DECIMAL(14,2) NOT NULL DEFAULT 0,  -- refunds issued that day
    closing_cash      DECIMAL(14,2) NOT NULL DEFAULT 0,  -- computed
    adjustment_note   TEXT,
    approved_by       INTEGER REFERENCES users(id),
    created_by        INTEGER REFERENCES users(id),
    created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cashbook_branch_date ON daily_cashbook (branch_id, ledger_date);
