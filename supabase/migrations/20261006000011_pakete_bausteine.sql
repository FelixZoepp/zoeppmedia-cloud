-- Leistungs-Bausteine pro Kunde (indeed / meta / innendienst) – steuern die Fulfillment-Schritte.
-- NULL = Bestandskunde: Fulfillment wie bisher (Indeed + Funnel/Meta).
alter table public.agencies add column if not exists bausteine text[];

alter table public.agencies drop constraint if exists agencies_bausteine_check;
alter table public.agencies add constraint agencies_bausteine_check
  check (bausteine is null or bausteine <@ array['indeed','meta','innendienst']::text[]);

-- Kleinstes Paket: nur Indeed, 500 €/Monat, 12 Monate
insert into public.paket_definitionen (key, name, setup_netto, retainer_netto, ust_satz, laufzeit_monate, werbebudget_empfohlen, leistungen, aktiv)
values ('indeed_start', 'Indeed Start', 0, 500, 19, 12, 0,
        array['Indeed-Anzeige (erstellt und geschaltet von uns)', 'Skripte & Recruiting-Prozess', 'Bewerber-Cloud Zugang', 'Masterclass'], true)
on conflict (key) do update set name = excluded.name, retainer_netto = excluded.retainer_netto,
  laufzeit_monate = excluded.laufzeit_monate, leistungen = excluded.leistungen, aktiv = true;

-- Aktivitäts-Log: Typen, die der Code längst schreibt, wurden vom Check still verworfen
alter table public.activity_log drop constraint if exists activity_log_action_type_check;
alter table public.activity_log add constraint activity_log_action_type_check check (action_type = any (array[
  'login','call','stage_change','note','content_approval','content_rejection','recording_upload','onboarding_complete',
  'survey_submitted','funnel_published','candidate_created','invite_sent','email_sent','task_completed','other',
  'after_close','setup_error','leistungen','appointment_booked','appointment_cancelled','appointment_done',
  'appointment_no_show','appointment_reminder_sent','bot_opened','bot_closed','bot_completed','bot_handover',
  'bot_timeout','consent_event','dankevideo_updated','documents_request','report_approved','report_sent'
]::text[]));
