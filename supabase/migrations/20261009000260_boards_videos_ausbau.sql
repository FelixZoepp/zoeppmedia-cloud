-- Ausbau Boards + Video-Freigabe (09.10.)

-- Boards: Checklisten, Archiv, Tagesliste für „erledigt 2“ per WhatsApp
create table if not exists public.aufgaben_checkliste (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.internal_tasks(id) on delete cascade,
  text text not null,
  erledigt boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_aufgaben_checkliste_task on public.aufgaben_checkliste (task_id);
alter table public.aufgaben_checkliste enable row level security;

alter table public.aufgaben_boards add column if not exists archiviert boolean not null default false;

create table if not exists public.aufgaben_tageslisten (
  user_id uuid not null references public.users(id) on delete cascade,
  tag date not null,
  task_ids uuid[] not null default '{}',
  gesendet_am timestamptz not null default now(),
  primary key (user_id, tag)
);
alter table public.aufgaben_tageslisten enable row level security;

-- Video: Zeitbereich, Kunden-Kommentare, Kunden-Freigabe per Link
alter table public.video_kommentare
  add column if not exists zeit_bis_s numeric,
  add column if not exists kunde_name text,
  add column if not exists extern boolean not null default false;

alter table public.videos
  add column if not exists kunden_status text check (kunden_status in ('offen', 'freigegeben', 'aenderungen')),
  add column if not exists kunden_entscheidung_am timestamptz;

create table if not exists public.video_freigabe_links (
  token uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  erstellt_von uuid references public.users(id) on delete set null,
  aktiv boolean not null default true,
  gueltig_bis timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_video_freigabe_links_video on public.video_freigabe_links (video_id);
alter table public.video_freigabe_links enable row level security;
