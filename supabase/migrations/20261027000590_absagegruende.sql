-- Absagegründe auswertbar: Code aus festem Katalog (src/lib/recruiting/absagegruende.ts),
-- Notiz, Zeitpunkt, wer, und in welcher Phase der Bewerber vorher war.
-- candidates.ablehngrund bleibt als Anzeigetext erhalten.
alter table candidates add column if not exists absage_code text;
alter table candidates add column if not exists absage_notiz text;
alter table candidates add column if not exists abgesagt_am timestamptz;
alter table candidates add column if not exists abgesagt_von uuid references users(id) on delete set null;
alter table candidates add column if not exists absage_phase_id uuid references pipeline_stages(id) on delete set null;

create index if not exists candidates_abgesagt_idx on candidates (agency_id, abgesagt_am) where abgesagt_am is not null;

-- Altbestand: aktuell abgesagte Bewerber übernehmen (nur DB, keine Nachrichten)
with abgesagt as (
  select c.id, c.ablehngrund,
    (select max(cs.changed_at) from candidate_stages cs where cs.candidate_id = c.id and cs.stage_id = c.current_stage_id) as seit,
    (select cs.changed_by from candidate_stages cs where cs.candidate_id = c.id and cs.stage_id = c.current_stage_id order by cs.changed_at desc limit 1) as von,
    (select cs2.stage_id from candidate_stages cs2
      where cs2.candidate_id = c.id and cs2.stage_id <> c.current_stage_id
        and cs2.changed_at < coalesce((select max(cs.changed_at) from candidate_stages cs where cs.candidate_id = c.id and cs.stage_id = c.current_stage_id), now())
      order by cs2.changed_at desc limit 1) as phase,
    c.created_at
  from candidates c
  join pipeline_stages ps on ps.id = c.current_stage_id
  where c.absage_code is null
    and (ps.stage_type = 'rejected' or ps.name ilike 'abgesagt%')
)
update candidates c set
  absage_code = case trim(a.ablehngrund)
    when 'Nicht erschienen zum Probetag' then 'probetag_nicht_erschienen'
    when 'Nach Probetag abgelehnt' then 'nach_probetag_abgelehnt'
    when 'Mangelnde Einsatzbereitschaft' then 'wenig_energie'
    when 'Kein Führerschein / Kein Auto' then 'kein_fuehrerschein'
    when 'Sprachbarriere' then 'sprache'
    when 'Nur Festanstellung gewünscht' then 'nur_festanstellung'
    when 'Minderjährig' then 'unter_18'
    when 'Keine Motivation erkennbar' then 'keine_motivation'
    when 'Bewerber hat abgesagt' then 'bewerber_abgesagt'
    when 'Nicht erreichbar (nach 3 Versuchen)' then 'nicht_erreichbar'
    when 'Falsche Erwartungen an den Verdienst' then 'verdienst_erwartung'
    when 'Passt nicht' then 'ohne_grund'
    else case when coalesce(trim(a.ablehngrund), '') = '' then 'ohne_grund' else 'sonstiges' end
  end,
  absage_notiz = case
    when trim(a.ablehngrund) in ('Nicht erschienen zum Probetag','Nach Probetag abgelehnt','Mangelnde Einsatzbereitschaft',
      'Kein Führerschein / Kein Auto','Sprachbarriere','Nur Festanstellung gewünscht','Minderjährig','Keine Motivation erkennbar',
      'Bewerber hat abgesagt','Nicht erreichbar (nach 3 Versuchen)','Falsche Erwartungen an den Verdienst','Passt nicht') then null
    else nullif(left(trim(a.ablehngrund), 500), '')
  end,
  abgesagt_am = coalesce(a.seit, a.created_at, now()),
  abgesagt_von = a.von,
  absage_phase_id = a.phase
from abgesagt a
where c.id = a.id;
