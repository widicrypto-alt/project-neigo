-- PLANv3 X2.5 — Regex scripts 4-mode (edit_input / edit_process / edit_output / edit_display).

CREATE TABLE IF NOT EXISTS regex_scripts (
  id              varchar(36)  PRIMARY KEY,
  user_id         varchar(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'character' | 'preset' | 'user'
  scope           varchar(16)  NOT NULL,
  -- character_id / preset_id when scope != 'user', else NULL.
  scope_id        varchar(36),
  name            varchar(200) NOT NULL,
  find_regex      text         NOT NULL,
  replace_string  text         NOT NULL DEFAULT '',
  trim_strings    jsonb        NOT NULL DEFAULT '[]'::jsonb,
  -- 'edit_input' | 'edit_output' | 'edit_process' | 'edit_display'
  placement       varchar(20)  NOT NULL,
  flags           varchar(8)   NOT NULL DEFAULT 'g',
  prompt_only     boolean      NOT NULL DEFAULT false,
  order_index     integer      NOT NULL DEFAULT 0,
  min_depth       integer,
  max_depth       integer,
  enabled         boolean      NOT NULL DEFAULT true,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT regex_scripts_scope_chk CHECK (scope IN ('character','preset','user')),
  CONSTRAINT regex_scripts_placement_chk
    CHECK (placement IN ('edit_input','edit_output','edit_process','edit_display'))
);

CREATE INDEX IF NOT EXISTS regex_scripts_scope_idx
  ON regex_scripts (user_id, scope, scope_id, placement, order_index);

ALTER TABLE regex_scripts ENABLE ROW LEVEL SECURITY;
-- Server connects as table owner (bypasses RLS); no policies needed here.
-- External anon/authenticated roles are default-deny per 0002_rls.sql pattern.
