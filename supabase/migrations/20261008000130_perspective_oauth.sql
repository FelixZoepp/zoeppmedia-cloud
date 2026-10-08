-- Perspective per OAuth (Remote-MCP https://api.perspective.co/mcp akzeptiert nur Bearer-Tokens).
-- Eine Verbindung für die ganze Cloud; Tokens AES-GCM-verschlüsselt (src/lib/crypto.ts).
CREATE TABLE IF NOT EXISTS perspective_verbindung (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  client_id text,
  access_token_enc text,
  refresh_token_enc text,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'getrennt' CHECK (status IN ('getrennt', 'verbunden', 'abgelaufen')),
  fehler text,
  company_id text,
  subscription_id text,
  verbunden_am timestamptz,
  verbunden_von uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Sperre gegen parallele Refreshs (Auth0-Refresh-Tokens rotieren, doppelte Nutzung widerruft sie)
  lock_bis timestamptz NOT NULL DEFAULT 'epoch',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Nur Service-Role (keine Policies)
ALTER TABLE perspective_verbindung ENABLE ROW LEVEL SECURITY;

INSERT INTO perspective_verbindung (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
