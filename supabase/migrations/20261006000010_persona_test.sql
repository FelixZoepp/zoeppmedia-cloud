-- 12 Persona-Typen (12personatypen.de): Persönlichkeitstest für Vertriebsbewerber.
-- Konfiguration je Agentur liegt verschlüsselt in agencies.settings.persona
-- ({ aktiv, freigeschaltet_am, api_key_enc, webhook_secret_enc }).
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS persona_status text CHECK (persona_status IS NULL OR persona_status IN ('eingeladen', 'begonnen', 'abgeschlossen')),
  ADD COLUMN IF NOT EXISTS persona_typ text,
  ADD COLUMN IF NOT EXISTS persona_typ_key text,
  ADD COLUMN IF NOT EXISTS persona_fit text,
  ADD COLUMN IF NOT EXISTS persona_score int,
  ADD COLUMN IF NOT EXISTS persona_warnungen jsonb,
  ADD COLUMN IF NOT EXISTS persona_dimensionen jsonb,
  ADD COLUMN IF NOT EXISTS persona_report_url text,
  ADD COLUMN IF NOT EXISTS persona_invite_url text,
  ADD COLUMN IF NOT EXISTS persona_eingeladen_am timestamptz,
  ADD COLUMN IF NOT EXISTS persona_abgeschlossen_am timestamptz,
  ADD COLUMN IF NOT EXISTS persona_extern_id text;

CREATE INDEX IF NOT EXISTS candidates_persona_eingeladen ON candidates (agency_id, persona_eingeladen_am) WHERE persona_eingeladen_am IS NOT NULL;
