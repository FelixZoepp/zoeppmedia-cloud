-- Telefonieren über die Cloud (Twilio, im Browser) + Gesprächsaufnahmen
-- call_recordings stand in der Migrationsliste, fehlte aber in der Datenbank → hier neu (idempotent)
create table if not exists call_recordings (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  agency_id uuid not null references agencies(id) on delete cascade,
  uploaded_by uuid not null references users(id),
  recording_type text not null check (recording_type in ('erstgespraech', 'vorstellungsgespraech', 'follow_up', 'sonstiges')),
  file_url text not null,
  file_name text not null,
  file_size_bytes integer,
  duration_seconds integer,
  transcript text,
  transcript_status text not null default 'pending' check (transcript_status in ('pending', 'processing', 'done', 'failed')),
  analysis jsonb,
  analysis_status text not null default 'pending' check (analysis_status in ('pending', 'processing', 'done', 'failed')),
  created_at timestamptz default now()
);
create index if not exists idx_call_recordings_candidate on call_recordings(candidate_id);
create index if not exists idx_call_recordings_agency on call_recordings(agency_id);
alter table call_recordings enable row level security;
drop policy if exists "Agency members can read own recordings" on call_recordings;
create policy "Agency members can read own recordings" on call_recordings for select
  using (agency_id = (select agency_id from users where id = auth.uid()));
drop policy if exists "Agency members can insert own recordings" on call_recordings;
create policy "Agency members can insert own recordings" on call_recordings for insert
  with check (agency_id = (select agency_id from users where id = auth.uid()));
drop policy if exists "Internal users can read all recordings" on call_recordings;
create policy "Internal users can read all recordings" on call_recordings for select
  using (public.get_user_role(auth.uid()) in ('admin', 'employee'));

alter table call_recordings add column if not exists twilio_anruf_id uuid;

-- Ein Eintrag je Anruf aus dem Browser; nur der Server schreibt (keine Policies)
create table if not exists twilio_anrufe (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  call_sid text unique,
  nach text not null,
  von text not null,
  aufnahme boolean not null default false,
  status text not null default 'gestartet',
  dauer_sekunden integer,
  recording_id uuid references call_recordings(id) on delete set null,
  created_at timestamptz not null default now(),
  beendet_am timestamptz
);
create index if not exists idx_twilio_anrufe_candidate on twilio_anrufe(candidate_id, created_at desc);
alter table twilio_anrufe enable row level security;
