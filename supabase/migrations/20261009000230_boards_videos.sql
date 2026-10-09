-- Aufgaben-Boards (persönlich + Team), wiederkehrende Aufgaben, Sprachnachrichten
create table if not exists public.aufgaben_boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  besitzer_id uuid references public.users(id) on delete cascade,
  beschreibung text,
  farbe text,
  sortierung integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_aufgaben_boards_besitzer on public.aufgaben_boards (besitzer_id) where besitzer_id is not null;
alter table public.aufgaben_boards enable row level security;

create table if not exists public.aufgaben_serien (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references public.aufgaben_boards(id) on delete cascade,
  assigned_to uuid references public.users(id) on delete set null,
  title text not null,
  description text,
  priority public.task_priority not null default 'medium',
  rhythmus text not null check (rhythmus in ('taeglich', 'woechentlich', 'monatlich')),
  wochentag integer check (wochentag between 1 and 7),
  monatstag integer check (monatstag between 1 and 31),
  nur_werktags boolean not null default true,
  aktiv boolean not null default true,
  naechste_am date not null,
  letzte_am date,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.aufgaben_serien enable row level security;

alter table public.internal_tasks
  add column if not exists board_id uuid references public.aufgaben_boards(id) on delete set null,
  add column if not exists serie_id uuid references public.aufgaben_serien(id) on delete set null,
  add column if not exists quelle text not null default 'manuell',
  add column if not exists position double precision,
  add column if not exists erledigt_am timestamptz;
create unique index if not exists uq_internal_tasks_serie_tag on public.internal_tasks (serie_id, due_date) where serie_id is not null;
create index if not exists idx_internal_tasks_board on public.internal_tasks (board_id);

create table if not exists public.aufgaben_sprachnachrichten (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  quelle text not null default 'cloud' check (quelle in ('cloud', 'whatsapp')),
  transkript text,
  ergebnis jsonb,
  created_at timestamptz not null default now()
);
alter table public.aufgaben_sprachnachrichten enable row level security;

-- Video-Freigabe (Ads, Website-Videos, Reels)
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  agency_id uuid references public.agencies(id) on delete set null,
  art text not null default 'ad' check (art in ('ad', 'website', 'reel', 'sonstiges')),
  status text not null default 'in_pruefung' check (status in ('in_pruefung', 'aenderungen', 'freigegeben')),
  bearbeiter_id uuid references public.users(id) on delete set null,
  pruefer_id uuid references public.users(id) on delete set null,
  aktuelle_version integer not null default 1,
  faellig_am date,
  freigegeben_am timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.videos enable row level security;

create table if not exists public.video_versionen (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  version integer not null,
  storage_pfad text not null,
  dateiname text,
  groesse_bytes bigint,
  dauer_s numeric,
  hochgeladen_von uuid references public.users(id) on delete set null,
  ki_status text not null default 'offen' check (ki_status in ('offen', 'laeuft', 'fertig', 'fehler')),
  ki_ergebnis jsonb,
  created_at timestamptz not null default now(),
  unique (video_id, version)
);
alter table public.video_versionen enable row level security;

create table if not exists public.video_kommentare (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  version_id uuid references public.video_versionen(id) on delete cascade,
  zeit_s numeric,
  text text not null,
  autor_id uuid references public.users(id) on delete set null,
  ki boolean not null default false,
  erledigt boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_video_kommentare_video on public.video_kommentare (video_id, version_id);
alter table public.video_kommentare enable row level security;

-- Privater Bucket für Videos (Zugriff nur über signierte URLs der Cloud)
insert into storage.buckets (id, name, public, file_size_limit)
values ('videos', 'videos', false, 524288000)
on conflict (id) do nothing;
