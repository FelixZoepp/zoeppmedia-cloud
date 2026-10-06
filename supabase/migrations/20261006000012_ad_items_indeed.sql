-- Indeed-Anzeige als eigener Ad-Typ (Text statt Datei) – läuft durch dieselbe Prüfung + Kundenfreigabe
alter table public.ad_items drop constraint if exists ad_items_typ_check;
alter table public.ad_items add constraint ad_items_typ_check check (typ = any (array['grafik','video','reel','karussell','indeed']::text[]));
-- strukturierter Inhalt (z. B. Indeed: Titel, Gehalt, Arbeitsort, Text)
alter table public.ad_items add column if not exists inhalt jsonb;
