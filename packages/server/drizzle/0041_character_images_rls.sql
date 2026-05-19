-- PLANBv7 W-A — Enable RLS on character_images + character_image_quota.
-- Defense-in-depth: the server currently uses a service-role pg connection
-- so policies don't gate it today, but if we ever thread Supabase JWT
-- passthrough down to the pool (app.user_id GUC) these become effective.

ALTER TABLE character_images       ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_image_quota  ENABLE ROW LEVEL SECURITY;

-- Owner: full CRUD over their own rows.
DROP POLICY IF EXISTS character_images_owner_all ON character_images;
CREATE POLICY character_images_owner_all ON character_images
  FOR ALL
  USING (user_id = current_setting('app.user_id', true)::varchar)
  WITH CHECK (user_id = current_setting('app.user_id', true)::varchar);

-- Public read: moderation approved AND not NSFW. NSFW gallery entries stay
-- visible to the owner only (covered by owner_all).
DROP POLICY IF EXISTS character_images_public_read ON character_images;
CREATE POLICY character_images_public_read ON character_images
  FOR SELECT
  USING (moderation_status = 'approved' AND nsfw = false);

-- Per-user quota table: owner-only.
DROP POLICY IF EXISTS character_image_quota_owner_all ON character_image_quota;
CREATE POLICY character_image_quota_owner_all ON character_image_quota
  FOR ALL
  USING (user_id = current_setting('app.user_id', true)::varchar)
  WITH CHECK (user_id = current_setting('app.user_id', true)::varchar);
