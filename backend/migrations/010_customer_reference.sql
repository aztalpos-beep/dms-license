-- Add "referred by" field to customers

ALTER TABLE customers ADD COLUMN IF NOT EXISTS referred_by TEXT;
