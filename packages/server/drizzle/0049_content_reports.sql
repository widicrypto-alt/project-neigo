-- PLANIMPv7 — content reports table for moderation.
CREATE TABLE IF NOT EXISTS content_reports (
  id           VARCHAR(36) PRIMARY KEY,
  entity_type  VARCHAR(16) NOT NULL,
  entity_id    VARCHAR(36) NOT NULL,
  reporter_id  VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category     VARCHAR(32) NOT NULL,
  detail       VARCHAR(1000),
  status       VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  reviewer_id  VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS content_reports_entity_idx
  ON content_reports(entity_type, entity_id, status);
CREATE INDEX IF NOT EXISTS content_reports_status_idx
  ON content_reports(status, created_at);

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_reports_own ON content_reports;
CREATE POLICY content_reports_own ON content_reports
  FOR ALL USING (reporter_id = current_setting('app.user_id', true)::varchar);

-- Analytics events (30-day retention via cron).
CREATE TABLE IF NOT EXISTS analytics_events (
  id           VARCHAR(36) PRIMARY KEY,
  event_type   VARCHAR(50) NOT NULL,
  user_id      VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  entity_type  VARCHAR(16),
  entity_id    VARCHAR(36),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_events_entity_idx
  ON analytics_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_user_idx
  ON analytics_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_type_idx
  ON analytics_events(event_type, created_at DESC);

-- Discover scores cache (refreshed every 15 min by cron).
CREATE TABLE IF NOT EXISTS discover_scores (
  entity_type  VARCHAR(16) NOT NULL,
  entity_id    VARCHAR(36) NOT NULL,
  score        REAL NOT NULL DEFAULT 0,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_type, entity_id)
);
