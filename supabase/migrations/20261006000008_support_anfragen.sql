-- Support-Anfragen der Kunden (Fragen, Probleme, Wünsche, Upsell-Interesse aus den Empfehlungen)
CREATE TABLE IF NOT EXISTS support_anfragen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  art text NOT NULL CHECK (art IN ('frage', 'problem', 'wunsch', 'interesse')),
  thema text NOT NULL,
  nachricht text,
  empfehlung_id text,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'in_bearbeitung', 'erledigt')),
  antwort text,
  bearbeitet_von uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE support_anfragen ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS support_anfragen_agency_created ON support_anfragen (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_anfragen_status ON support_anfragen (status);

DROP POLICY IF EXISTS "Support lesen" ON support_anfragen;
CREATE POLICY "Support lesen" ON support_anfragen FOR SELECT TO authenticated
  USING (public.can_access_agency(agency_id));

DROP POLICY IF EXISTS "Support anlegen" ON support_anfragen;
CREATE POLICY "Support anlegen" ON support_anfragen FOR INSERT TO authenticated
  WITH CHECK (public.can_access_agency(agency_id) AND (user_id = auth.uid() OR public.is_internal_user()));

DROP POLICY IF EXISTS "Support bearbeiten (intern)" ON support_anfragen;
CREATE POLICY "Support bearbeiten (intern)" ON support_anfragen FOR UPDATE TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
