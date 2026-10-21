-- Bilder vom Kunden fürs Fulfillment (Fotos von sich, Team, Arbeitsalltag, Logo).
-- Hochgeladen über /api/kunden-bilder (signierter Upload-Link), Meldung ans Team in Slack gebündelt (gemeldet_am).
create table if not exists kunden_bilder (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  pfad text not null unique,
  kategorie text not null check (kategorie in ('ich', 'team', 'arbeit', 'logo')),
  dateiname text,
  groesse integer,
  hochgeladen_von uuid references users(id) on delete set null,
  gemeldet_am timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_kunden_bilder_agency on kunden_bilder(agency_id, created_at desc);
create index if not exists idx_kunden_bilder_ungemeldet on kunden_bilder(agency_id) where gemeldet_am is null;

-- Nur der Server (Service-Rolle) greift zu
alter table kunden_bilder enable row level security;

-- Privater Speicher: keine Policies → nur Server und signierte Links
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kunden-bilder', 'kunden-bilder', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/svg+xml'])
on conflict (id) do nothing;
