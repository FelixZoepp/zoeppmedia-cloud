-- Sales: Eintragungen (neue Leads in Close) → Termin direkt gebucht oder nach 10 Min. nicht → „Jetzt anrufen“
CREATE TABLE IF NOT EXISTS sales_eintragungen (
  lead_id text PRIMARY KEY,
  name text,
  email text,
  phone text,
  quelle text,
  eingetragen_am timestamptz NOT NULL,
  gebucht_am timestamptz,
  ergebnis text NOT NULL DEFAULT 'offen' CHECK (ergebnis IN ('offen', 'direkt_gebucht', 'nicht_gebucht', 'spaeter_gebucht')),
  anruf_aufgabe_am timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_eintragungen_zeit ON sales_eintragungen(eingetragen_am DESC);
ALTER TABLE sales_eintragungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Eintragungen intern lesen" ON sales_eintragungen FOR SELECT TO authenticated USING (public.is_internal_user());
