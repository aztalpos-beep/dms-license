-- Phase 5: Returns / Cancellations

CREATE TABLE IF NOT EXISTS returns (
    id              SERIAL PRIMARY KEY,
    sale_id         INTEGER NOT NULL REFERENCES sales(id),
    return_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    refund_status   TEXT NOT NULL DEFAULT 'none' CHECK (refund_status IN ('full', 'partial', 'none')),
    refund_amount   DECIMAL(14,2) NOT NULL DEFAULT 0,
    stock_restored  BOOLEAN NOT NULL DEFAULT FALSE,
    notes           TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns (sale_id);
