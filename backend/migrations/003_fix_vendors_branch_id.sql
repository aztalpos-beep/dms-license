-- Fix: an unrelated leftover migration file created the "vendors" table
-- earlier without a branch_id column. This adds the missing column.

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id);
