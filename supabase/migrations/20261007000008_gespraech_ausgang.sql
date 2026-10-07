-- Ausgang eines analysierten Gesprächs (aus Close: Deal gewonnen/verloren) – Abgleich Prognose vs. Ergebnis
alter table public.gespraech_analysen add column if not exists ausgang text not null default 'offen' check (ausgang in ('offen','gewonnen','verloren'));
alter table public.gespraech_analysen add column if not exists ausgang_am date;
