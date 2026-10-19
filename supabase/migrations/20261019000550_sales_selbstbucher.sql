-- Terminierung „Bucht sich selbst ein“: Zusage + Frist; der Check zur Frist trägt ein, ob wirklich gebucht wurde.
create table if not exists sales_selbstbucher (
  protokoll_id text primary key,
  lead_id text not null,
  zugesagt_am timestamptz not null default now(),
  frist timestamptz not null,
  ergebnis text not null default 'offen' check (ergebnis in ('offen', 'gebucht', 'nicht_gebucht')),
  geprueft_am timestamptz
);
create index if not exists idx_sales_selbstbucher_zugesagt on sales_selbstbucher(zugesagt_am desc);
alter table sales_selbstbucher enable row level security;
