-- ============================================================
-- KELZ HOUNDS ORG INVENTORY — Supabase Schema
-- Paste this entire file into Supabase SQL Editor and run it.
-- Project ref: njsmomshevbigaxmjvmj
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- COMPONENTS
-- ============================================================
create table if not exists components (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  function    text,                          -- Power Plant, Cooler, Shield Generator, etc.
  comp_class  text,                          -- Stealth, Military, Competition, Civilian, Industrial
  grade       text,                          -- A, B, C, D
  size        text,                          -- S0, S1, S2 ... S7
  qty         integer not null default 1,
  owner       text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- MATERIALS
-- ============================================================
create table if not exists materials (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  ore_type    text,                          -- Laranite, Quantanium, Carinite, etc.
  quality     integer default 0,            -- 1–1000 purity scale
  qty         integer not null default 1,   -- SCU
  owner       text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- BLUEPRINTS
-- ============================================================
create table if not exists blueprints (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  bp_output   text,                          -- What it crafts/produces
  bp_status   text default 'wanted',         -- owned, researching, wanted
  bp_runs     integer default 0,             -- 0 = unlimited
  bp_holder   text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- WIKELO ITEMS
-- ============================================================
create table if not exists wikelo_items (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  wk_type     text,                          -- favor, rare, currency, loot
  wk_grade    text,                          -- AAA, AA, A, B, Pure, Irradiated
  wk_qty      integer default 0,
  wk_needed   integer default 0,
  wk_dkp      integer default 0,            -- DKP per unit (from Guild Manager)
  wk_target   text,                          -- Target ship/reward
  wk_holder   text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- WIKELO RECIPES
-- Persists recipe definitions so they don't reset on refresh
-- ============================================================
create table if not exists wikelo_recipes (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  items       text[] not null default '{}', -- Array of required item name strings
  sort_order  integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- AUTO-UPDATE updated_at on row changes
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger components_updated_at  before update on components  for each row execute function update_updated_at();
create trigger materials_updated_at   before update on materials   for each row execute function update_updated_at();
create trigger blueprints_updated_at  before update on blueprints  for each row execute function update_updated_at();
create trigger wikelo_items_updated_at before update on wikelo_items for each row execute function update_updated_at();
create trigger wikelo_recipes_updated_at before update on wikelo_recipes for each row execute function update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- For now: public read/write with anon key.
-- Tighten this when Discord OAuth is added.
-- ============================================================
alter table components    enable row level security;
alter table materials     enable row level security;
alter table blueprints    enable row level security;
alter table wikelo_items  enable row level security;
alter table wikelo_recipes enable row level security;

create policy "public read"  on components    for select using (true);
create policy "public write" on components    for all    using (true);
create policy "public read"  on materials     for select using (true);
create policy "public write" on materials     for all    using (true);
create policy "public read"  on blueprints    for select using (true);
create policy "public write" on blueprints    for all    using (true);
create policy "public read"  on wikelo_items  for select using (true);
create policy "public write" on wikelo_items  for all    using (true);
create policy "public read"  on wikelo_recipes for select using (true);
create policy "public write" on wikelo_recipes for all    using (true);

-- ============================================================
-- SEED: Default Wikelo recipes (4.7.1)
-- ============================================================
insert into wikelo_recipes (name, items, sort_order) values
('Trade MG Scrip → Favor',     array['MG Scrip'], 1),
('Trade Council Scrip → Favor', array['Council Scrip'], 2),
('Turn Carinite → Favor',       array['Carinite'], 3),
('Trade Valakkar → Favor',      array['Irradiated Valakkar Pearl'], 4),
('ATLS IKTI',                   array['Wikelo Favor','Irradiated Valakkar Fang (Apex)','NN-13 Cannon','Argo ATLS'], 5),
('ATLS GEO Snowland',           array['Wikelo Favor','Irradiated Valakkar Pearl'], 6),
('ATLS GEO Orange Line',        array['Wikelo Favor','Quantanium','Copper','Tungsten','Corundum','Argo ATLS'], 7),
('ATLS GEO Cool Metal',         array['Wikelo Favor','Carinite (Pure)','Argo ATLS'], 8),
('Nox',                         array['Wikelo Favor'], 9),
('Pulse',                       array['Wikelo Favor'], 10),
('Ursa Medivac',                array['Wikelo Favor','Saldynium','Jaclium'], 11),
('L-21 Wolf (Stealth)',         array['Wikelo Favor','Vanduul Plating','Vanduul Metal','Large Artifact Fragment (Pristine)'], 12),
('L-21 Wolf (Military)',        array['Wikelo Favor'], 13),
('Golem',                       array['Wikelo Favor','ASD Secure Drive'], 14),
('Intrepid',                    array['Wikelo Favor','Government Cartography Agency Medal (Pristine)'], 15),
('Fortune',                     array['Wikelo Favor','Carinite (Pure)'], 16),
('C1 Spirit',                   array['Wikelo Favor','Tevarin War Service Marker (Pristine)'], 17),
('Zeus Mk II ES',               array['Wikelo Favor','UEE 6th Platoon Medal (Pristine)'], 18),
('Zeus Mk II CL',               array['Wikelo Favor','Carinite','Ace Interceptor Helmet','Carinite (Pure)'], 19),
('Starlancer MAX',              array['Wikelo Favor','Ace Interceptor Helmet','Carinite (Pure)','Irradiated Valakkar Pearl'], 20),
('Constellation Taurus',        array['Wikelo Favor','Carinite (Pure)','Irradiated Valakkar Pearl','Government Cartography Agency Medal (Pristine)'], 21),
('Argo RAFT',                   array['Wikelo Favor','Irradiated Valakkar Fang (Adult)','Irradiated Valakkar Fang (Juvenile)','Irradiated Kopion Horn','Irradiated Valakkar Pearl'], 22),
('MISC Prospector',             array['Wikelo Favor','Carinite','Saldynium','Jaclium','Carinite (Pure)'], 23),
('Sabre Firebird',              array['Wikelo Favor','DCHS-05 Orbital Positioning Comp-Board','Ace Interceptor Helmet','Government Cartography Agency Medal (Pristine)'], 24),
('Scorpius',                    array['Wikelo Favor','DCHS-05 Orbital Positioning Comp-Board','Tevarin War Service Marker (Pristine)'], 25),
('F7C-M Super Hornet Mk II',    array['Wikelo Favor','DCHS-05 Orbital Positioning Comp-Board','Ace Interceptor Helmet','Government Cartography Agency Medal (Pristine)'], 26),
('Guardian',                    array['Wikelo Favor','Irradiated Valakkar Pearl','Ace Interceptor Helmet','Tevarin War Service Marker (Pristine)'], 27),
('Guardian QI',                 array['Wikelo Favor','Irradiated Valakkar Pearl','DCHS-05 Orbital Positioning Comp-Board','UEE 6th Platoon Medal (Pristine)'], 28),
('Guardian MX',                 array['Wikelo Favor','Ace Interceptor Helmet','Large Artifact Fragment (Pristine)','Vanduul Plating','Vanduul Metal'], 29),
('F8C Lightning (Military)',    array['Wikelo Favor','Carinite (Pure)','Irradiated Valakkar Pearl','Tevarin War Service Marker (Pristine)'], 30),
('F8C Lightning (Stealth)',     array['Wikelo Favor','DCHS-05 Orbital Positioning Comp-Board','Carinite (Pure)','Irradiated Valakkar Pearl'], 31),
('Terrapin Medic',              array['Wikelo Favor','ASD Secure Drive','Tevarin War Service Marker (Pristine)'], 32),
('Starlancer TAC',              array['Wikelo Favor','Ace Interceptor Helmet','ASD Secure Drive','Irradiated Valakkar Pearl','Tevarin War Service Marker (Pristine)','Carinite (Pure)','DCHS-05 Orbital Positioning Comp-Board'], 33),
('Ares Inferno',                array['Wikelo Favor','Yormandi Tongue','Ace Interceptor Helmet','UEE 6th Platoon Medal (Pristine)'], 34),
('Ares Ion',                    array['Wikelo Favor','Yormandi Eye','Ace Interceptor Helmet','Tevarin War Service Marker (Pristine)'], 35),
('Prowler Utility',             array['Wikelo Favor','Yormandi Eye','Yormandi Tongue','Irradiated Valakkar Pearl','Carinite (Pure)'], 36),
('A2 Hercules Starlifter',      array['Wikelo Favor','Polaris Bit','MG Scrip','ASD Secure Drive','Irradiated Valakkar Pearl','Tevarin War Service Marker (Pristine)','DCHS-05 Orbital Positioning Comp-Board','Carinite (Pure)'], 37),
('Anvil Asgard',                array['Wikelo Favor','ASD Secure Drive','RCMBNT-PWL-1','RCMBNT-PWL-2','RCMBNT-PWL-3','RCMBNT-RGL-1','RCMBNT-RGL-2','RCMBNT-RGL-3','RCMBNT-XTL-1','RCMBNT-XTL-2','RCMBNT-XTL-3'], 38),
('RSI Meteor',                  array['Wikelo Favor','Ace Interceptor Helmet','Large Artifact Fragment (Pristine)','Vanduul Plating','Vanduul Metal'], 39),
('Polaris',                     array['Wikelo Favor','Carinite','Irradiated Valakkar Fang (Apex)','MG Scrip','Polaris Bit','ASD Secure Drive','Ace Interceptor Helmet','Irradiated Valakkar Pearl','UEE 6th Platoon Medal (Pristine)','Carinite (Pure)','DCHS-05 Orbital Positioning Comp-Board','RCMBNT-PWL-1','RCMBNT-RGL-1','RCMBNT-XTL-1'], 40),
('Aegis Idris-P',               array['Wikelo Favor','Polaris Bit','DCHS-05 Orbital Positioning Comp-Board','Carinite','Irradiated Valakkar Fang (Apex)','MG Scrip','Ace Interceptor Helmet','ASD Secure Drive','Irradiated Valakkar Pearl','UEE 6th Platoon Medal (Pristine)','Carinite (Pure)','RCMBNT-PWL-1','RCMBNT-RGL-1','RCMBNT-XTL-1'], 41),
('Apollo Triage',               array['Wikelo Favor','Savrilium'], 42);
