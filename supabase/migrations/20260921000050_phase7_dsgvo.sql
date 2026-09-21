-- Phase 7: DSGVO & Härtung (Spec §14, §16 Phase 7)

-- Audit-CHECKs erweitern (Typen in src/lib/audit/log.ts enthalten bereits 'job'/'application')
ALTER TABLE audit_log DROP CONSTRAINT audit_log_entity_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type IN ('candidate','agency','user','automation','template','pipeline_stage','consent','recording','settings','job','application','export'));
ALTER TABLE audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN ('create','update','delete','access','impersonate','export','anonymize'));

-- Datenschutzerklärung pro Mandant (Spec §14)
ALTER TABLE agencies ADD COLUMN privacy_url text;

-- Consent-Versionierung (Spec §14: Einwilligungstext + Version + Zeitpunkt + Quelle)
ALTER TABLE candidates ADD COLUMN consent_version int;
ALTER TABLE candidates ADD COLUMN consent_text_snapshot text;
ALTER TABLE candidates ADD COLUMN anonymized_at timestamptz;

-- Rate-Limiting fixed window (Ruling P7-R3)
CREATE TABLE rate_limit_counters (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 1
);
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;
-- Keine Policies: Zugriff nur über Service-Role
