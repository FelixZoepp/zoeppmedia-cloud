-- Fulfillment v2: Phasen-Board mit kleinen Schritten, Ads-Ablauf, Buchhaltung (Rechnungsliste + Mahnwesen).
-- Schrittkatalog lebt im Code (src/lib/fulfillment/catalog.ts); hier nur die Instanzen pro Kunde.

-- ---------------------------------------------------------------------------
-- 1. Phase pro Kunde
-- ---------------------------------------------------------------------------
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS fulfillment_phase TEXT
  CHECK (fulfillment_phase IS NULL OR fulfillment_phase IN ('zahlung', 'onboarding', 'setup', 'continuity', 'offboarding', 'beendet'));
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS fulfillment_phase_seit TIMESTAMPTZ;
-- Kampagnenstart: Basis für die Continuity-Checks (Tag 7 … 90)
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS launch_datum DATE;
-- Vertragsstart: Rechnungstag für den monatlichen Retainer
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS vertragsstart DATE;
-- z.B. "Zurückbehaltungsrecht – Zahlung offen"
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS pausiert_grund TEXT;

-- ---------------------------------------------------------------------------
-- 2. Schritte pro Kunde
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  phase TEXT NOT NULL,
  wer TEXT NOT NULL CHECK (wer IN ('kunde', 'zoepp')),
  status TEXT NOT NULL DEFAULT 'offen'
    CHECK (status IN ('offen', 'in_arbeit', 'zur_pruefung', 'erledigt', 'nicht_noetig')),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  faellig_am DATE,
  gestartet_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  erledigt_am TIMESTAMPTZ,
  erledigt_von UUID REFERENCES users(id) ON DELETE SET NULL,
  kommentar TEXT,
  ergebnis_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id, step_key)
);
CREATE INDEX IF NOT EXISTS idx_client_steps_agency ON client_steps(agency_id);
CREATE INDEX IF NOT EXISTS idx_client_steps_owner_open ON client_steps(owner_user_id) WHERE status NOT IN ('erledigt', 'nicht_noetig');

-- Verlauf jeder Statusänderung — Basis für "lag es an uns oder am Kunden?"
CREATE TABLE IF NOT EXISTS client_step_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES client_steps(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  von_status TEXT,
  nach_status TEXT NOT NULL,
  kommentar TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_step_log_step ON client_step_log(step_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. Ads-Ablauf
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  titel TEXT NOT NULL,
  idee TEXT,
  typ TEXT NOT NULL DEFAULT 'grafik' CHECK (typ IN ('grafik', 'video', 'reel', 'karussell')),
  stage TEXT NOT NULL DEFAULT 'idee'
    CHECK (stage IN ('idee', 'material', 'bearbeitung', 'freigabe_kunde', 'bereit', 'live', 'verworfen')),
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  faellig_am DATE,
  material_urls JSONB NOT NULL DEFAULT '[]',
  asset_path TEXT,
  asset_url TEXT,
  kunden_kommentar TEXT,
  freigegeben_am TIMESTAMPTZ,
  live_am TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_items_agency ON ad_items(agency_id);
CREATE INDEX IF NOT EXISTS idx_ad_items_stage ON ad_items(stage) WHERE stage NOT IN ('live', 'verworfen');

CREATE TABLE IF NOT EXISTS ad_item_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_item_id UUID NOT NULL REFERENCES ad_items(id) ON DELETE CASCADE,
  von_stage TEXT,
  nach_stage TEXT NOT NULL,
  kommentar TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO storage.buckets (id, name, public) VALUES ('ad-assets', 'ad-assets', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Buchhaltung: Rechnungsliste
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_due (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  typ TEXT NOT NULL CHECK (typ IN ('setup', 'retainer')),
  periode TEXT NOT NULL, -- 'setup' oder 'YYYY-MM'
  faellig_am DATE NOT NULL,
  betrag_netto NUMERIC(10,2),
  geschrieben_am TIMESTAMPTZ,
  geschrieben_von UUID REFERENCES users(id) ON DELETE SET NULL,
  rechnungsnummer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id, typ, periode)
);

-- ---------------------------------------------------------------------------
-- 5. Buchhaltung: Mahnwesen (Zoepp-System, 7 Schritte)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dunning_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  lex_invoice_id TEXT NOT NULL UNIQUE,
  rechnungsnummer TEXT,
  kontakt_name TEXT,
  betrag_offen NUMERIC(10,2),
  rechnungsdatum DATE NOT NULL,
  zahlungsziel DATE NOT NULL,
  typ TEXT NOT NULL DEFAULT 'retainer' CHECK (typ IN ('setup', 'retainer')),
  -- letzter erledigter Schritt (1 = Rechnung geschrieben … 7 = Anwalt)
  schritt INTEGER NOT NULL DEFAULT 1 CHECK (schritt BETWEEN 1 AND 7),
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'bezahlt', 'anwalt', 'storniert', 'ignoriert')),
  zugesagt_bis DATE,
  bezahlt_am TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dunning_cases_open ON dunning_cases(status) WHERE status = 'offen';

CREATE TABLE IF NOT EXISTS dunning_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES dunning_cases(id) ON DELETE CASCADE,
  schritt INTEGER NOT NULL CHECK (schritt BETWEEN 1 AND 7),
  ergebnis TEXT NOT NULL CHECK (ergebnis IN ('erreicht', 'nicht_erreicht', 'gesendet', 'abgegeben')),
  notiz TEXT,
  zugesagt_bis DATE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. RLS: Lesen für berechtigte Nutzer, Schreiben nur intern.
--    Kundenaktionen (Schritt erledigt, Ad freigeben) laufen über API-Routen mit Prüfung.
-- ---------------------------------------------------------------------------
ALTER TABLE client_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_step_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_item_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_due ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_steps select" ON client_steps FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "client_steps internal write" ON client_steps FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "client_step_log select" ON client_step_log FOR SELECT USING (can_access_agency(agency_id));

CREATE POLICY "ad_items select" ON ad_items FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "ad_items internal write" ON ad_items FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "ad_item_log select" ON ad_item_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM ad_items a WHERE a.id = ad_item_id AND can_access_agency(a.agency_id)));

-- Buchhaltung: nur intern
CREATE POLICY "invoice_due internal" ON invoice_due FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "dunning_cases internal" ON dunning_cases FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "dunning_actions internal" ON dunning_actions FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

ALTER PUBLICATION supabase_realtime ADD TABLE client_steps, ad_items;
