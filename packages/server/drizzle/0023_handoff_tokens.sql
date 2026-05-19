-- PLANv2 post-wk14 — Device handoff via QR.
--
-- A handoff token is a short-lived, single-use credential created by a
-- logged-in device. The other device scans a QR containing the token
-- and calls /handoff/claim to mint a fresh session cookie for the same
-- user. Tokens are one-time: claiming sets used_at and the row becomes
-- invalid.

CREATE TABLE IF NOT EXISTS handoff_tokens (
  token         varchar(48) PRIMARY KEY,
  user_id       varchar(36) NOT NULL
                 REFERENCES users(id) ON DELETE CASCADE,
  -- Optional: the session the source device is currently on, so the
  -- claiming device can be redirected straight into the resume flow.
  session_id    varchar(36)
                 REFERENCES chat_sessions(id) ON DELETE SET NULL,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS handoff_tokens_user_idx
  ON handoff_tokens(user_id, expires_at);
