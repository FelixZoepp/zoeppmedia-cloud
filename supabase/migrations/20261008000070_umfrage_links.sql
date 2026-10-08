-- Zufriedenheits-Umfragen ohne Login: persönlicher Link je eingeplanter Umfrage (Review 2026-10-08)

-- Zufälliger, nicht erratbarer Schlüssel für /umfrage/<token>
ALTER TABLE survey_schedule ADD COLUMN IF NOT EXISTS token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_schedule_token ON survey_schedule (token);

-- Antworten über den Link haben keinen eingeloggten Nutzer
ALTER TABLE survey_responses ALTER COLUMN user_id DROP NOT NULL;

-- Versand-Abfrage: noch nicht verschickt, nicht beantwortet, nach Fälligkeit
CREATE INDEX IF NOT EXISTS idx_survey_schedule_versand
  ON survey_schedule (scheduled_at)
  WHERE sent_at IS NULL AND completed_at IS NULL;

-- Bestehende, nie verschickte Einträge (vor dem Stichtag 2026-10-09) bleiben bewusst unverschickt:
-- der Versand filtert auf scheduled_at >= Stichtag, es wird nichts nachgeholt.
