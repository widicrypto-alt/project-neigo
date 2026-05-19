-- Push notification infrastructure:
--   1. push_subscriptions table (Web Push endpoint + VAPID keys per device)
--   2. pushOptOut + lastPushSentAt columns on users
--   3. RLS backend_only policy for push_subscriptions
--
-- Idempotent: safe to re-run.

-- ── 1. Users: new columns ────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS push_opt_out    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_push_sent_at timestamptz;

-- ── 2. push_subscriptions table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          varchar(36)  PRIMARY KEY,
  user_id     varchar(36)  NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint    text         NOT NULL,
  p256dh      text         NOT NULL,
  auth        text         NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx
  ON public.push_subscriptions (endpoint);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backend_only ON public.push_subscriptions;
CREATE POLICY backend_only
  ON public.push_subscriptions
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);
