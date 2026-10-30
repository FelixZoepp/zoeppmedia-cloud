-- Feste Kosten, die eigentlich über die Karte laufen (Werbung, Sixt): nur als Planwert zählen, solange für den Monat keine Kartenumsätze da sind
alter table public.finanz_fixkosten add column if not exists nur_planung boolean not null default false;
