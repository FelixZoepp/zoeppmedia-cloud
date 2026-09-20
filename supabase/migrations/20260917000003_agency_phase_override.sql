-- Manual phase override for the client pipeline kanban.
-- When set, it wins over the automatically computed phase.
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS phase_override TEXT
  CHECK (phase_override IN ('onboarding_termin', 'onboarding_formular', 'fulfillment', 'kampagne_live', 'kickoff_14d', 'bestandskunde'));

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS phase_override_at TIMESTAMPTZ;
