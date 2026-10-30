-- Kundenhistorie: Kündigungsgrund als feste Auswahl (woher kommt der Churn?)
alter table public.finanz_kunden_status add column if not exists kuendigungsgrund text check (kuendigungsgrund is null or kuendigungsgrund in ('Ergebnisse', 'Preis', 'Eigener Vertrieb gescheitert', 'Kommunikation', 'Zahlungsausfall / Streitfall', 'Projekt beendet', 'Sonstiges'));
