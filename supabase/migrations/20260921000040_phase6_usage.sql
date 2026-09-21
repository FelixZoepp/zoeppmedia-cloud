-- Phase 6: Verbrauchserfassung (Spec §5 usage_daily, §11 tägliche Aggregation, §12 Agentur-Dashboard)

CREATE TABLE usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  day date NOT NULL,
  messages_out int NOT NULL DEFAULT 0,
  messages_in int NOT NULL DEFAULT 0,
  templates_by_category jsonb NOT NULL DEFAULT '{}',
  ai_input_tokens bigint NOT NULL DEFAULT 0,
  ai_output_tokens bigint NOT NULL DEFAULT 0,
  ai_cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, day)
);
CREATE INDEX idx_usage_daily_agency_day ON usage_daily(agency_id, day DESC);
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage_daily select" ON usage_daily FOR SELECT USING (can_access_agency(agency_id));

-- Preistabelle für geschätzte Meta-Gebühren, im Admin pflegbar (Spec §12, §17)
CREATE TABLE meta_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL UNIQUE,
  price_eur numeric(10,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE meta_pricing ENABLE ROW LEVEL SECURITY;
-- Keine Policies: Zugriff nur über Service-Role (Admin-APIs)

INSERT INTO meta_pricing (category, price_eur) VALUES
  ('marketing', 0.1400),
  ('utility', 0.0200),
  ('authentication', 0.0130),
  ('service', 0.0000);
