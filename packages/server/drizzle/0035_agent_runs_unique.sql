-- PLANv3 audit P0 — Dedupe agent_runs on retry.
--
-- Problem: the orchestrator's shadow hook fires inside runSinglePass's retry
-- loop (attempts 0..MAX_RETRIES). On retry, runPipelineShadow re-inserts rows
-- with the same (session_id, turn_index, agent_config_id), inflating shadow
-- metrics 2-3× and poisoning parity analysis before flipping
-- AGENT_PIPELINE_ENABLED=true.
--
-- Fix: UNIQUE index so we can `ON CONFLICT DO NOTHING` in persistRun.
-- Existing duplicates (if any) are collapsed to the earliest row per tuple
-- so the unique index can be created successfully.

DELETE FROM agent_runs a
USING agent_runs b
WHERE a.session_id      = b.session_id
  AND a.turn_index      = b.turn_index
  AND a.agent_config_id = b.agent_config_id
  AND a.created_at      > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS agent_runs_session_turn_config_uniq
  ON agent_runs (session_id, turn_index, agent_config_id);
