-- Review-Fixes (Codex/Claude, 09.10.):
-- Partielle Unique-Indizes können von Upserts (ON CONFLICT) nicht genutzt werden → volle Unique-Constraints
-- (NULL-Werte bleiben mehrfach erlaubt). Betraf: persönliche Boards, Sales-WhatsApp-Vorlagen.
drop index if exists public.uq_aufgaben_boards_besitzer;
alter table public.aufgaben_boards add constraint uq_aufgaben_boards_besitzer unique (besitzer_id);

drop index if exists public.uq_wa_templates_account_preset;
alter table public.whatsapp_templates add constraint uq_wa_templates_account_preset unique (wa_account_id, preset_key);

-- Diktat idempotent: je Nachricht + Vorschlag nur einmal anlegen (Job-Wiederholung, Doppelklick)
alter table public.internal_tasks add column if not exists quelle_ref text;
alter table public.internal_tasks add constraint uq_internal_tasks_quelle_ref unique (quelle_ref);
alter table public.aufgaben_serien add column if not exists quelle_ref text;
alter table public.aufgaben_serien add constraint uq_aufgaben_serien_quelle_ref unique (quelle_ref);
alter table public.aufgaben_sprachnachrichten add column if not exists ref text;
alter table public.aufgaben_sprachnachrichten add constraint uq_aufgaben_sprachnachrichten_ref unique (ref);

-- Rückruf-Aufgabe aus dem Zufriedenheits-Check nur einmal je Check
alter table public.survey_schedule add column if not exists rueckruf_aufgabe_am timestamptz;

-- KI-Prüfung: Sperre gegen parallele Läufe
alter table public.video_versionen add column if not exists ki_gestartet_am timestamptz;
