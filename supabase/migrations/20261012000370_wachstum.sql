-- Wachstum: Lead-Herkunft je Anzeige, Protokoll-Lücken, Empfehlungen, Freigaben
create table if not exists lead_herkunft (
  lead_id text primary key,
  quelle text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  eingetragen_am timestamptz not null default now()
);
create index if not exists idx_lead_herkunft_content on lead_herkunft(utm_content, eingetragen_am desc);
alter table lead_herkunft enable row level security;

-- Gespräche ohne Protokoll (für Briefing + Erinnerung an den Mitarbeiter)
create table if not exists protokoll_luecken (
  call_id text primary key,
  lead_id text,
  lead_name text,
  user_id text,
  user_name text,
  anruf_am timestamptz not null,
  dauer_s integer,
  aufgabe_angelegt boolean not null default false,
  erledigt_am timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_protokoll_luecken_offen on protokoll_luecken(lead_id, user_id) where erledigt_am is null;
alter table protokoll_luecken enable row level security;

-- Empfehlungen / Erfolgsgeschichten je Kunde
create table if not exists empfehlungen (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  art text not null check (art in ('empfehlung', 'video', 'bewertung')),
  status text not null default 'vorgeschlagen' check (status in ('vorgeschlagen', 'angefragt', 'zugesagt', 'erhalten', 'abgelehnt')),
  notiz text,
  empfohlen_name text,
  bearbeitet_von uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, art)
);
alter table empfehlungen enable row level security;
