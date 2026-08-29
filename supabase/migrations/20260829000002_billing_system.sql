-- Billing system: plans, mandates, billing runs, integration logs

CREATE TABLE billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  typ TEXT NOT NULL CHECK (typ IN ('setup', 'retainer')),
  betrag_netto NUMERIC(10,2) NOT NULL,
  ust_satz NUMERIC(4,2) NOT NULL DEFAULT 19.00,
  rhythmus TEXT NOT NULL CHECK (rhythmus IN ('einmalig', 'monatlich')),
  faelligkeitstag INTEGER DEFAULT 1 CHECK (faelligkeitstag BETWEEN 1 AND 28),
  start_datum DATE NOT NULL,
  ende_datum DATE,
  status TEXT NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf', 'aktiv', 'pausiert', 'beendet')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_plans_agency ON billing_plans(agency_id);
ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages billing_plans" ON billing_plans FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Service manages billing_plans" ON billing_plans FOR ALL
  USING (true) WITH CHECK (true);

CREATE TABLE mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mollie' CHECK (provider IN ('mollie')),
  provider_customer_id TEXT,
  provider_mandate_id TEXT,
  status TEXT NOT NULL DEFAULT 'angefragt' CHECK (status IN ('angefragt', 'gueltig', 'widerrufen', 'fehlgeschlagen')),
  erteilt_am TIMESTAMPTZ,
  letzte_pruefung TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mandates_agency ON mandates(agency_id);
ALTER TABLE mandates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages mandates" ON mandates FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Service manages mandates" ON mandates FOR ALL
  USING (true) WITH CHECK (true);

CREATE TABLE billing_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES billing_plans(id),
  periode TEXT NOT NULL,
  idempotenz_schluessel TEXT NOT NULL UNIQUE,
  lex_invoice_id TEXT,
  lex_invoice_number TEXT,
  mollie_payment_id TEXT,
  betrag_netto NUMERIC(10,2) NOT NULL,
  betrag_brutto NUMERIC(10,2) NOT NULL,
  ust_betrag NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN (
    'offen', 'rechnung_erstellt', 'zahlung_angestossen', 'bezahlt', 'fehlgeschlagen', 'storniert'
  )),
  fehlergrund TEXT,
  versuche INTEGER DEFAULT 0,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  bezahlt_am TIMESTAMPTZ
);

CREATE INDEX idx_billing_runs_agency ON billing_runs(agency_id);
CREATE INDEX idx_billing_runs_idempotenz ON billing_runs(idempotenz_schluessel);
ALTER TABLE billing_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages billing_runs" ON billing_runs FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Service manages billing_runs" ON billing_runs FOR ALL
  USING (true) WITH CHECK (true);

CREATE TABLE integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system TEXT NOT NULL CHECK (system IN ('lexoffice', 'mollie')),
  richtung TEXT NOT NULL CHECK (richtung IN ('request', 'response', 'webhook')),
  endpunkt TEXT NOT NULL,
  methode TEXT,
  payload_hash TEXT,
  http_status INTEGER,
  antwort_auszug TEXT,
  agency_id UUID REFERENCES agencies(id),
  fehler BOOLEAN DEFAULT false,
  zeitpunkt TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_integration_logs_agency ON integration_logs(agency_id);
CREATE INDEX idx_integration_logs_system ON integration_logs(system);
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin sees integration_logs" ON integration_logs FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Service manages integration_logs" ON integration_logs FOR ALL
  USING (true) WITH CHECK (true);
