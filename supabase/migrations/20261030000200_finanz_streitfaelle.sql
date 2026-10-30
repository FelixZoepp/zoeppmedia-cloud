-- Cash-Plan: Streitfälle (abgeschlossen, zahlen nicht) – zählen nicht in den Geldeingang, eigener Block mit Quoten
alter table public.finanz_vertraege drop constraint if exists finanz_vertraege_status_check;
alter table public.finanz_vertraege add constraint finanz_vertraege_status_check check (status in ('aktiv', 'startet', 'beendet', 'streitfall'));
alter table public.finanz_vertraege add column if not exists abschluss_am date;          -- Datum des Abschlusses (Angebot angenommen)
alter table public.finanz_vertraege add column if not exists offen_betrag numeric(12,2); -- offener Betrag netto bei Streitfällen
