-- Wk10 PLANv2 G3a — message swiping.
--
-- A "swipe" is an alternate generation for the same (sessionId, turnIndex)
-- slot. Historically /regenerate hard-deleted the prior attempt; that
-- discards work the user may want to compare against. Going forward, each
-- regeneration preserves the previous row(s) as inactive siblings so the
-- user can swipe left/right to revisit prior drafts.
--
-- Fields:
--   swipe_root  — id of the FIRST assistant row in the family; all siblings
--                  including self point at the same root. Originals left
--                  NULL migrate lazily (null = self).
--   swipe_index — 0-based monotonically increasing rank within the family.
--   is_active   — exactly one row per family may be active. The renderer
--                  and loadHistory filter to is_active = TRUE.
--
-- Index supports the hot-path "active messages for this session, ordered
-- by turn_index" query used in /messages and loadHistory.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS swipe_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS swipe_root varchar(36),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS messages_active_idx
  ON chat_messages(session_id, turn_index)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS messages_swipe_root_idx
  ON chat_messages(swipe_root)
  WHERE swipe_root IS NOT NULL;
