-- Deal-Feier: jeder gewonnene Deal einmal (Slack + Animation in der Cloud)
create table if not exists deal_feiern (
  id uuid primary key default gen_random_uuid(),
  opp_id text not null unique,
  lead_id text,
  firma text,
  closer text,
  volumen numeric,
  gif text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_deal_feiern_created on deal_feiern(created_at desc);
alter table deal_feiern enable row level security;
