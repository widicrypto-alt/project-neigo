-- BACKLOG B1.6 — related_entities materialized view.
-- Co-reaction based similarity: users who reacted to A also reacted to B.
-- Score = number of shared reactors (higher = more related).
-- Refreshed every 15 min by cron.

CREATE MATERIALIZED VIEW IF NOT EXISTS related_entities AS
SELECT
  a.entity_type                 AS from_type,
  a.entity_id                   AS from_id,
  b.entity_type                 AS to_type,
  b.entity_id                   AS to_id,
  COUNT(DISTINCT a.user_id)::int AS score
FROM reactions a
JOIN reactions b
  ON a.user_id = b.user_id
 AND (a.entity_type <> b.entity_type OR a.entity_id <> b.entity_id)
GROUP BY a.entity_type, a.entity_id, b.entity_type, b.entity_id
HAVING COUNT(DISTINCT a.user_id) >= 2;

-- Primary lookup: "find top-N related for a given from entity".
CREATE INDEX IF NOT EXISTS related_entities_from_idx
  ON related_entities (from_type, from_id, score DESC);

-- Unique so REFRESH MATERIALIZED VIEW CONCURRENTLY can be used later.
CREATE UNIQUE INDEX IF NOT EXISTS related_entities_pk_idx
  ON related_entities (from_type, from_id, to_type, to_id);
