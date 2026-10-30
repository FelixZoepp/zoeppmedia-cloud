-- Kundenhistorie für Quoten (Angabe Felix): Segment Direktvertrieb, Upsell ja/nein, Rückgewinnung – Grundlage für Upsell-/Rückgewinnungsquote
create table if not exists public.finanz_kunden_status (
  id uuid primary key default gen_random_uuid(),
  kunde text not null unique,
  lex_kontakte text[] not null default '{}',   -- Lexware-Kontaktnamen (mehrere = ein Kunde)
  segment text not null default 'd2d' check (segment in ('d2d', 'sonstige', 'raus')),
  upsell boolean,                               -- null = noch nicht bewertet
  rueckgewinnung boolean,
  aktiv boolean not null default false,
  notiz text,
  updated_at timestamptz not null default now()
);
alter table public.finanz_kunden_status enable row level security;
