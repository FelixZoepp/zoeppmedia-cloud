-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Agencies
create table agencies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- Invite tokens
create table invite_tokens (
  id uuid primary key default uuid_generate_v4(),
  agency_id uuid not null references agencies(id) on delete cascade,
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  email text not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  redeemed boolean not null default false,
  created_at timestamptz not null default now()
);

-- Users (linked to Supabase Auth)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  agency_id uuid not null references agencies(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null default 'owner' check (role in ('owner', 'admin')),
  last_login timestamptz,
  created_at timestamptz not null default now()
);

-- Pipeline stages (global, same for all agencies)
create table pipeline_stages (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  sort_order int not null,
  color text not null
);

-- Candidates
create table candidates (
  id uuid primary key default uuid_generate_v4(),
  agency_id uuid not null references agencies(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  source text not null default 'manual' check (source in ('meta', 'indeed', 'manual')),
  meta_campaign text,
  meta_adset text,
  meta_form text,
  current_stage_id uuid not null references pipeline_stages(id),
  created_at timestamptz not null default now()
);

-- Candidate stage history
create table candidate_stages (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  stage_id uuid not null references pipeline_stages(id),
  changed_by uuid references users(id),
  changed_at timestamptz not null default now()
);

-- Notes
create table notes (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  user_id uuid not null references users(id),
  text text not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_candidates_agency on candidates(agency_id);
create index idx_candidates_stage on candidates(current_stage_id);
create index idx_candidate_stages_candidate on candidate_stages(candidate_id);
create index idx_notes_candidate on notes(candidate_id);
create index idx_users_agency on users(agency_id);

-- RLS policies

-- agencies: users can read their own agency
alter table agencies enable row level security;
create policy "users read own agency" on agencies for select
  using (id = (select agency_id from users where id = auth.uid()));

-- invite_tokens: no direct access (admin only via service role)
alter table invite_tokens enable row level security;

-- users: users can read/update themselves
alter table users enable row level security;
create policy "users read own" on users for select
  using (id = auth.uid());
create policy "users update own" on users for update
  using (id = auth.uid());

-- pipeline_stages: public read
alter table pipeline_stages enable row level security;
create policy "stages public read" on pipeline_stages for select
  using (true);

-- candidates: agency-scoped
alter table candidates enable row level security;
create policy "candidates select" on candidates for select
  using (agency_id = (select agency_id from users where id = auth.uid()));
create policy "candidates insert" on candidates for insert
  with check (agency_id = (select agency_id from users where id = auth.uid()));
create policy "candidates update" on candidates for update
  using (agency_id = (select agency_id from users where id = auth.uid()));
create policy "candidates delete" on candidates for delete
  using (agency_id = (select agency_id from users where id = auth.uid()));

-- candidate_stages: agency-scoped via candidate
alter table candidate_stages enable row level security;
create policy "candidate_stages select" on candidate_stages for select
  using (candidate_id in (
    select id from candidates where agency_id = (select agency_id from users where id = auth.uid())
  ));
create policy "candidate_stages insert" on candidate_stages for insert
  with check (candidate_id in (
    select id from candidates where agency_id = (select agency_id from users where id = auth.uid())
  ));

-- notes: agency-scoped via candidate
alter table notes enable row level security;
create policy "notes select" on notes for select
  using (candidate_id in (
    select id from candidates where agency_id = (select agency_id from users where id = auth.uid())
  ));
create policy "notes insert" on notes for insert
  with check (candidate_id in (
    select id from candidates where agency_id = (select agency_id from users where id = auth.uid())
  ));
