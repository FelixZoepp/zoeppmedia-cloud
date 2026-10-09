-- Kunde sieht nur die Version, die intern freigegeben (oder bewusst geteilt) wurde – nicht jede neue Version sofort
alter table public.videos add column if not exists kunden_version integer;
update public.videos set kunden_version = aktuelle_version where kunden_status is not null and kunden_version is null;
