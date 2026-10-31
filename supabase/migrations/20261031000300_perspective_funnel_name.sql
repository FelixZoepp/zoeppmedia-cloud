-- Name des Funnels in Perspective (kommt im Webhook als funnelName) – für den Abgleich Webhook-Kunde ↔ feste Funnel-Zuordnung
alter table public.perspective_funnels add column if not exists funnel_name text;
create unique index if not exists perspective_funnels_funnel_id_uidx on public.perspective_funnels (perspective_funnel_id);
