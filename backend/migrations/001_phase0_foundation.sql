-- Phase 0: Foundation
-- Branches + Users + branch-locked auth support

CREATE TABLE IF NOT EXISTS branches (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,       -- e.g. 'Rehmat & Sons Hasilpur'
    location    TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    name           TEXT NOT NULL,
    username       TEXT NOT NULL,          -- unique PER BRANCH, not globally
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'manager', 'sales_staff', 'accountant')),
    branch_id      INTEGER REFERENCES branches(id),  -- NULL only allowed for super_admin
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),

    -- super_admin must NOT be tied to a single branch;
    -- every other role MUST be tied to exactly one branch.
    CONSTRAINT chk_branch_requirement CHECK (
        (role = 'super_admin' AND branch_id IS NULL)
        OR
        (role != 'super_admin' AND branch_id IS NOT NULL)
    )
);

-- username is only unique WITHIN a branch (two branches can each have their own "admin" username)
-- super_admin usernames must be globally unique (enforced with a partial index since branch_id is NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_branch_username
    ON users (branch_id, username)
    WHERE branch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_super_admin_username
    ON users (username)
    WHERE branch_id IS NULL;

CREATE TABLE IF NOT EXISTS audit_log (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   INTEGER,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
