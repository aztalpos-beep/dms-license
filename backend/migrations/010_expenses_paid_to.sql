-- Phase 8: Expense payee tracking (for Roznamcha "Reference / Vendor-Payee" column)

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_to TEXT;

COMMENT ON COLUMN expenses.paid_to IS 'Who the cash was paid to: vendor name, employee name (for salary), or payee. Shown as the Debit-side "Reference" in the daily cashbook.';
