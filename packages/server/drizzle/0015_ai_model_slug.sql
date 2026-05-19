-- Section C: allow per-session model override to store an OpenRouter slug
-- (up to 120 chars, matching users.byok_model). Previous 40 was too small
-- for slugs like cognitivecomputations/dolphin-mistral-24b-venice-edition:free.
ALTER TABLE chat_sessions
  ALTER COLUMN ai_model TYPE varchar(120);
