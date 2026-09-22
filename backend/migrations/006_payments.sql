-- Phase 4: Payments & Recovery

CREATE TABLE IF NOT EXISTS sale_payments (
    id                    SERIAL PRIMARY KEY,
    sale_id               INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    payment_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    amount_received       DECIMAL(14,2) NOT NULL,
    payment_method        TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank', 'other')),
    linked_installment_id INTEGER REFERENCES sale_payment_plan(id),
    notes                 TEXT,  -- e.g. "partial", "early", "late"
    recorded_by           INTEGER REFERENCES users(id),
    created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments (sale_id);
