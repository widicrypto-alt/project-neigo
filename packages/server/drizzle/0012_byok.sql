-- BYOK: Bring Your Own Key (OpenRouter)
-- Users may store their own OpenRouter API key, encrypted at rest.
-- byok_or_key_enc: AES-256-GCM encrypted key (hex: iv:authTag:ciphertext)
-- byok_model: OpenRouter model slug chosen by user (e.g. 'anthropic/claude-sonnet-4-5')

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS byok_or_key_enc text,
  ADD COLUMN IF NOT EXISTS byok_model varchar(120);
