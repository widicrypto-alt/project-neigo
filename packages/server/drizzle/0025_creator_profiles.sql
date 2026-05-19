-- 0025_creator_profiles.sql
-- REDESIGNv2 D3 — public creator profiles in ROLEPLAY beta.
-- Adds a URL-safe handle + an opt-in `profile_is_public` flag.
-- Reuses existing users.profile_bio for the bio field (no new column).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS handle varchar(40),
  ADD COLUMN IF NOT EXISTS profile_is_public boolean NOT NULL DEFAULT false;

-- Backfill handle from the email local-part, sanitized to [a-z0-9_], with a
-- minimum length of 3 (pad with underscores) and uniqueness via row_number.
-- Handles collisions by appending a 4-char numeric suffix.
WITH base AS (
  SELECT
    id,
    LOWER(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-z0-9_]', '_', 'g')) AS raw
  FROM users
  WHERE handle IS NULL
),
padded AS (
  SELECT
    id,
    CASE
      WHEN LENGTH(raw) < 3 THEN RPAD(raw, 3, '_')
      WHEN LENGTH(raw) > 40 THEN LEFT(raw, 40)
      ELSE raw
    END AS candidate
  FROM base
),
ranked AS (
  SELECT
    id,
    candidate,
    ROW_NUMBER() OVER (PARTITION BY candidate ORDER BY id) AS rn
  FROM padded
)
UPDATE users u
SET handle = CASE
  WHEN r.rn = 1 THEN r.candidate
  ELSE LEFT(r.candidate, 36) || '_' || LPAD((r.rn)::text, 3, '0')
END
FROM ranked r
WHERE u.id = r.id;

CREATE UNIQUE INDEX IF NOT EXISTS users_handle_idx ON users(handle) WHERE handle IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_profile_public_idx ON users(profile_is_public) WHERE profile_is_public = true;
