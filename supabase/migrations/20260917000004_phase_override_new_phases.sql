-- Add waiting phases to the override constraint
ALTER TABLE agencies DROP CONSTRAINT IF EXISTS agencies_phase_override_check;
ALTER TABLE agencies ADD CONSTRAINT agencies_phase_override_check
  CHECK (phase_override IN ('onboarding_termin', 'onboarding_formular', 'fulfillment', 'warten_zugaenge', 'warten_starttermin', 'kampagne_live', 'kickoff_14d', 'bestandskunde'));
