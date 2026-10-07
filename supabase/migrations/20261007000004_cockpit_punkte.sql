-- Admin-Cockpit: Entscheidungen (mit Empfehlung des Teams) und Prioritäten der Woche
CREATE TABLE IF NOT EXISTS cockpit_punkte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  typ text NOT NULL CHECK (typ IN ('entscheidung', 'prioritaet')),
  titel text NOT NULL,
  empfehlung text,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  faellig_am date,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'ja', 'nein', 'erledigt', 'verschoben')),
  notiz text,
  erstellt_von uuid REFERENCES users(id) ON DELETE SET NULL,
  entschieden_am timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cockpit_punkte_offen ON cockpit_punkte(typ, status, created_at DESC);
ALTER TABLE cockpit_punkte ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cockpit intern lesen" ON cockpit_punkte FOR SELECT TO authenticated USING (public.is_internal_user());
