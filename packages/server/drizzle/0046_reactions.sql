-- PLANIMPv1 — polymorphic reactions (like / bookmark / rose) for characters & stories.
-- story_reactions already covers stories; this table covers characters + future types.
CREATE TABLE IF NOT EXISTS reactions (
  entity_type  VARCHAR(16) NOT NULL,
  entity_id    VARCHAR(36) NOT NULL,
  user_id      VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         VARCHAR(20) NOT NULL, -- 'like' | 'bookmark' | 'rose'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_type, entity_id, user_id, kind)
);

CREATE INDEX IF NOT EXISTS reactions_entity_idx
  ON reactions(entity_type, entity_id, kind);

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reactions_own ON reactions;
CREATE POLICY reactions_own ON reactions
  FOR ALL USING (user_id = current_setting('app.user_id', true)::varchar);
DROP POLICY IF EXISTS reactions_public_read ON reactions;
CREATE POLICY reactions_public_read ON reactions
  FOR SELECT USING (true);
