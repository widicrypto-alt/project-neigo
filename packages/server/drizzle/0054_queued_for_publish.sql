-- BACKLOG B2.6 — `queued_for_publish` pre-flight flag.
-- When a creator requests `isPublic = true` while their primary avatar is
-- still in moderation (`needs_review`), we hold the publish gate, set this
-- flag, and the ops/automated approval flow flips it back into a real
-- publish. Default false so existing rows are untouched.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS queued_for_publish boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS characters_queued_for_publish_idx
  ON characters (queued_for_publish)
  WHERE queued_for_publish = true;
