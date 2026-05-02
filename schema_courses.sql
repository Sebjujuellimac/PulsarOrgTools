-- ============================================================
-- PULSAR ORG TOOLS — Courses & Tracks
-- Run AFTER schema_bot.sql, schema_cert.sql, and schema_rls.sql
-- (RLS depends on is_officer()).
--
-- Migrates the static course data from bot/courseData.js into
-- the database so officers can edit it from the dashboard while
-- keeping the bot, cert system, and /event create dropdown in sync.
--
-- Soft-retire model: courses are never deleted, just stamped with
-- retired_at. Existing certs continue to point at retired codes.
-- ============================================================

-- ── Tracks ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracks (
  name          text PRIMARY KEY,
  emoji         text,
  color         text DEFAULT '#7eb8f7',
  display_order int  NOT NULL DEFAULT 0,
  retired_at    timestamptz,
  created_at    timestamptz DEFAULT now()
);

-- ── Courses ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  code          text PRIMARY KEY,
  title         text NOT NULL,
  track         text NOT NULL REFERENCES tracks(name) ON UPDATE CASCADE,
  prereqs       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of course codes
  breadth       jsonb,                                -- { "Air Wing":"AWC-01", ... }
  description   text,
  display_order int  NOT NULL DEFAULT 0,
  retired_at    timestamptz,                          -- soft-retire stamp
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courses_track ON courses(track);

-- updated_at auto-bump
CREATE OR REPLACE FUNCTION courses_updated_at()
RETURNS trigger AS $$ BEGIN new.updated_at = now(); RETURN new; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS courses_updated_at ON courses;
CREATE TRIGGER courses_updated_at BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION courses_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE tracks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read"   ON tracks;
DROP POLICY IF EXISTS "officer write" ON tracks;
CREATE POLICY "public read"   ON tracks FOR SELECT USING (true);
CREATE POLICY "officer write" ON tracks FOR ALL    USING (is_officer()) WITH CHECK (is_officer());

DROP POLICY IF EXISTS "public read"   ON courses;
DROP POLICY IF EXISTS "officer write" ON courses;
CREATE POLICY "public read"   ON courses FOR SELECT USING (true);
CREATE POLICY "officer write" ON courses FOR ALL    USING (is_officer()) WITH CHECK (is_officer());

-- ── Seed: tracks ──────────────────────────────────────────────
INSERT INTO tracks (name, emoji, display_order) VALUES
  ('Air Wing',      '✈️', 1),
  ('Ground Forces', '🪖', 2),
  ('MSF',           '⚓', 3),
  ('Fleet',         '🚀', 4),
  ('Comms',         '📡', 5),
  ('Mining',        '⛏️', 6),
  ('Salvage',       '🔧', 7),
  ('Logistics',     '📦', 8)
ON CONFLICT (name) DO NOTHING;

-- ── Seed: courses ─────────────────────────────────────────────
INSERT INTO courses (code, title, track, prereqs, breadth, display_order) VALUES
  ('BFS-01', 'First Time Pilot',                       'Air Wing',      '[]'::jsonb,                 NULL, 1),
  ('BFS-02', 'The Next Steps',                         'Air Wing',      '["BFS-01"]'::jsonb,         NULL, 2),
  ('AWC-01', 'Combat Basics',                          'Air Wing',      '["BFS-02"]'::jsonb,         NULL, 3),
  ('AWC-02', 'Element Tactics',                        'Air Wing',      '["AWC-01","COM-01"]'::jsonb, NULL, 4),
  ('AWC-03', 'Escort and Overwatch',                   'Air Wing',      '["AWC-02"]'::jsonb,         NULL, 5),

  ('GFC-01', 'Formation and FPS Fundamentals',         'Ground Forces', '[]'::jsonb,                 NULL, 1),
  ('GVO-01', 'Ground Vehicle Operations',              'Ground Forces', '["GFC-01"]'::jsonb,         NULL, 2),

  ('MSF-01', 'CQB and Shipboard Combat',               'MSF',           '["GFC-01","FLT-01","COM-01"]'::jsonb, NULL, 1),
  ('MSF-02', 'Boarding Operations',                    'MSF',           '["MSF-01"]'::jsonb,         NULL, 2),

  ('ENG-01', 'Ship Systems and Repair Fundamentals',   'Fleet',         '["BFS-01"]'::jsonb,         NULL, 1),
  ('FLT-01', 'Multicrew Fundamentals',                 'Fleet',         '["ENG-01","COM-01"]'::jsonb, NULL, 2),
  ('FLT-02', 'Capital Operations',                     'Fleet',         '["FLT-01"]'::jsonb,         NULL, 3),

  ('COM-01', 'Comms Fundamentals',                     'Comms',         '[]'::jsonb,                 NULL, 1),
  ('COM-02', 'SRS and Officer Comms',                  'Comms',         '["COM-01"]'::jsonb,
              '{"Air Wing":"AWC-01","Ground Forces":"GFC-01","Fleet":"FLT-01"}'::jsonb, 2),

  ('MNG-01', 'Mining Fundamentals',                    'Mining',        '[]'::jsonb,                 NULL, 1),
  ('MNG-02', 'Ship Mining and Crew Roles',             'Mining',        '["MNG-01"]'::jsonb,         NULL, 2),

  ('SAL-01', 'Salvage Fundamentals',                   'Salvage',       '["BFS-01"]'::jsonb,         NULL, 1),
  ('SAL-02', 'Post-Engagement Recovery Operations',    'Salvage',       '["SAL-01"]'::jsonb,         NULL, 2),

  ('LOG-01', 'Cargo and Transport',                    'Logistics',     '["BFS-01"]'::jsonb,         NULL, 1)
ON CONFLICT (code) DO NOTHING;
