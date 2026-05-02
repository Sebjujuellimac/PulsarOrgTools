-- ── Admin User Setup ─────────────────────────────────────────────────────────
-- Run this AFTER completing the steps below.
--
-- STEP 1: Create a Supabase auth user
--   Supabase Dashboard → Authentication → Users → "Add user" → "Create new user"
--   Email: whatever you like (e.g. admin@pulsarorgtools.internal)
--   Password: your org admin password
--   ✅ Auto confirm user: ON
--
-- STEP 2: Copy the UUID from the newly created user row.
--
-- STEP 3: Replace <PASTE_UUID_HERE> below and run this SQL.
--
-- STEP 4: Add the admin email to org_config so the dashboard knows which
--         Supabase account to sign into.
--   Replace <PASTE_EMAIL_HERE> with the email you used in Step 1.

INSERT INTO members (id, username, display_name, is_officer)
VALUES (
  '<PASTE_UUID_HERE>',   -- Supabase user UUID from Step 2
  'admin',
  'Org Admin',
  true
)
ON CONFLICT (id) DO UPDATE SET is_officer = true;

INSERT INTO org_config (key, value)
VALUES ('admin_email', '<PASTE_EMAIL_HERE>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
