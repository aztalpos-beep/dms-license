ALTER TABLE branches
ADD COLUMN IF NOT EXISTS demo_started_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ NULL;

-- Existing demo branches:
-- Trial starts when this migration is applied.
UPDATE branches
SET
  demo_started_at = COALESCE(demo_started_at, NOW()),
  demo_expires_at = COALESCE(demo_expires_at, NOW() + INTERVAL '3 days')
WHERE is_demo = TRUE;