-- PLANIMPv1 §4.3 — 5-star ratings per (user, entity) with aggregated view.
CREATE TABLE IF NOT EXISTS ratings (
  entity_type VARCHAR(16) NOT NULL,
  entity_id   VARCHAR(36) NOT NULL,
  user_id     VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars       SMALLINT    NOT NULL CHECK (stars BETWEEN 1 AND 5),
  review_md   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_type, entity_id, user_id)
);

CREATE INDEX IF NOT EXISTS ratings_entity_idx ON ratings(entity_type, entity_id);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ratings_own ON ratings;
CREATE POLICY ratings_own ON ratings
  FOR ALL USING (user_id = current_setting('app.user_id', true)::varchar);
DROP POLICY IF EXISTS ratings_public_read ON ratings;
CREATE POLICY ratings_public_read ON ratings
  FOR SELECT USING (true);

-- Materialized aggregate view (refreshed every 5 min by cron).
CREATE MATERIALIZED VIEW IF NOT EXISTS rating_aggregates AS
SELECT
  entity_type,
  entity_id,
  COUNT(*)::INT              AS total_ratings,
  AVG(stars)::REAL           AS avg_stars,
  COUNT(*) FILTER (WHERE stars = 5)::INT AS star5,
  COUNT(*) FILTER (WHERE stars = 4)::INT AS star4,
  COUNT(*) FILTER (WHERE stars = 3)::INT AS star3,
  COUNT(*) FILTER (WHERE stars = 2)::INT AS star2,
  COUNT(*) FILTER (WHERE stars = 1)::INT AS star1
FROM ratings
GROUP BY entity_type, entity_id;

CREATE UNIQUE INDEX IF NOT EXISTS rating_aggregates_pk
  ON rating_aggregates(entity_type, entity_id);
