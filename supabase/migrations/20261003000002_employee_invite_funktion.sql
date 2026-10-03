-- Mitarbeiter-Einladung mit Funktion (media_buyer = Ads/Funnel, backoffice = Buchhaltung, csm = Kundenbetreuung)
ALTER TABLE employee_invites ADD COLUMN IF NOT EXISTS funktion TEXT
  CHECK (funktion IS NULL OR funktion IN ('ops', 'content', 'media_buyer', 'csm', 'backoffice'));
