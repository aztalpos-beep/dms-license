-- Phase 6: Expenses

CREATE TABLE IF NOT EXISTS expenses (
    id                SERIAL PRIMARY KEY,
    expense_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    category          TEXT NOT NULL,
    description       TEXT,
    amount            DECIMAL(14,2) NOT NULL,
    receipt_image_url TEXT,
    status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by       INTEGER REFERENCES users(id),
    branch_id         INTEGER NOT NULL REFERENCES branches(id),
    created_by        INTEGER REFERENCES users(id),
    created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses (branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses (status);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (expense_date);
