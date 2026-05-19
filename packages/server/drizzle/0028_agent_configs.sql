-- PLANv3 X2.7 — Agent pipeline configs + runs (Day 9-10 shadow scaffolding).
--
-- phase: 'pre_generation' | 'parallel' | 'post_processing'
-- Built-in types seeded per user on register: 'continuity', 'format-guardian',
-- 'repetition', 'tone-guardian', 'world-state', 'director', 'chat-summary'.
-- Custom types use user-defined slugs.

CREATE TABLE IF NOT EXISTS agent_configs (
  id                varchar(36)  PRIMARY KEY,
  user_id           varchar(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              varchar(64)  NOT NULL,
  name              varchar(200) NOT NULL,
  phase             varchar(24)  NOT NULL,
  enabled           boolean      NOT NULL DEFAULT true,
  -- Optional BYOK connection id (schema is single-column today; kept as
  -- free-form varchar so future normalised byok_connections can plug in).
  connection_id     varchar(36),
  prompt_template   text         NOT NULL DEFAULT '',
  settings          jsonb        NOT NULL DEFAULT '{}'::jsonb,
  tools             jsonb        NOT NULL DEFAULT '[]'::jsonb,
  is_builtin        boolean      NOT NULL DEFAULT false,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT agent_configs_phase_chk
    CHECK (phase IN ('pre_generation','parallel','post_processing'))
);

CREATE INDEX IF NOT EXISTS agent_configs_user_phase_idx
  ON agent_configs (user_id, phase, enabled);

-- Built-in types are unique per user (prevents duplicate seeding).
CREATE UNIQUE INDEX IF NOT EXISTS agent_configs_user_type_builtin_idx
  ON agent_configs (user_id, type) WHERE is_builtin = true;

CREATE TABLE IF NOT EXISTS agent_runs (
  id               varchar(36)  PRIMARY KEY,
  agent_config_id  varchar(36)  NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
  session_id       varchar(36)  NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  turn_index       integer      NOT NULL,
  outcome          varchar(16)  NOT NULL DEFAULT 'pass',
  result_data      jsonb        NOT NULL DEFAULT '{}'::jsonb,
  tokens_in        integer,
  tokens_out       integer,
  latency_ms       integer,
  shadow           boolean      NOT NULL DEFAULT false,
  error            text,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT agent_runs_outcome_chk
    CHECK (outcome IN ('pass','retry','block','error'))
);

CREATE INDEX IF NOT EXISTS agent_runs_session_idx
  ON agent_runs (session_id, turn_index DESC);
CREATE INDEX IF NOT EXISTS agent_runs_config_created_idx
  ON agent_runs (agent_config_id, created_at DESC);

-- RLS — owner-role bypass pattern (matches 0002_rls.sql).
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs    ENABLE ROW LEVEL SECURITY;
