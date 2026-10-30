-- Cash-Plan: Rechnungen und Zahlungseingänge aus Lexware (Ist gegen Plan, Zahlungsmoral, Tage bis zum ersten Geld)
create table if not exists public.finanz_rechnungen (
  voucher_id text primary key,              -- Lexware-Beleg-ID
  nummer text,                              -- RE0597
  contact_id text,
  kontakt text,
  datum date,                               -- Rechnungsdatum
  faellig date,
  brutto numeric(12,2),
  netto numeric(12,2),                      -- aus der Rechnung (Detailabruf)
  offen numeric(12,2),
  status text,                              -- open | paid | paidoff | voided | overdue
  bezahlt_am date,                          -- aus den Zahlungen (Detailabruf)
  details_geladen boolean not null default false,
  lex_aktualisiert timestamptz,             -- updatedDate aus Lexware
  updated_at timestamptz not null default now()
);
create index if not exists finanz_rechnungen_contact_idx on public.finanz_rechnungen (contact_id);
create index if not exists finanz_rechnungen_bezahlt_idx on public.finanz_rechnungen (bezahlt_am);
alter table public.finanz_rechnungen enable row level security;

-- Vertrag ↔ Lexware-Kontakt (für Ist je Kunde und Tage bis zum ersten Geld)
alter table public.finanz_vertraege add column if not exists lex_contact_id text;
