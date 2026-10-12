-- Mahnwesen manuell: Verlauf mit Kanal + Details, Krisengespräche, Eskalation an die Geschäftsführung
alter table dunning_actions drop constraint if exists dunning_actions_ergebnis_check;
alter table dunning_actions add constraint dunning_actions_ergebnis_check
  check (ergebnis in ('erreicht', 'nicht_erreicht', 'gesendet', 'abgegeben', 'notiz', 'krisengespraech', 'eskalation', 'entscheidung', 'status'));
alter table dunning_actions add column if not exists kanal text;
alter table dunning_actions add column if not exists details jsonb;
-- Schritt 0 = Eintrag ohne Mahnstufe (Notiz, Krisengespräch, Entscheidung)
alter table dunning_actions drop constraint if exists dunning_actions_schritt_check;
alter table dunning_actions add constraint dunning_actions_schritt_check check (schritt between 0 and 7);
create index if not exists idx_dunning_actions_case on dunning_actions(case_id, created_at desc);

-- Einschätzung aus dem letzten Krisengespräch (zahlt / unsicher / ausfall)
alter table dunning_cases add column if not exists einschaetzung text check (einschaetzung in ('zahlt', 'unsicher', 'ausfall'));

-- Entscheidung im Cockpit ↔ Mahnfall
alter table cockpit_punkte add column if not exists dunning_case_id uuid references dunning_cases(id) on delete set null;
