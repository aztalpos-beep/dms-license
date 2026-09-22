-- Itemized manual lines for the Daily Cash Ledger.
-- Each daily_cashbook entry can now have any number of hand-entered lines
-- (particulars + amount) on the Credit (cash in) or Debit (cash out) side,
-- instead of a single lump-sum figure per category. The ledger stays fully
-- manual — nothing here is derived from sales/expenses/returns.

CREATE TABLE IF NOT EXISTS cashbook_lines (
    id            SERIAL PRIMARY KEY,
    cashbook_id   INTEGER NOT NULL REFERENCES daily_cashbook(id) ON DELETE CASCADE,
    side          TEXT NOT NULL CHECK (side IN ('credit', 'debit')),
    particulars   TEXT NOT NULL,
    amount        DECIMAL(14,2) NOT NULL,
    line_no       INTEGER NOT NULL DEFAULT 1,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashbook_lines_cashbook ON cashbook_lines (cashbook_id);
