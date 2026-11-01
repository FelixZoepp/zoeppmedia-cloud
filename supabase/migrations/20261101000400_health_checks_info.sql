-- Health-Checks: Ergebnis 'info' für Checks, die (noch) nichts prüfen – z. B. der Canary-Platzhalter.
-- Vorher meldete der Platzhalter täglich „ok“ (grünes Licht, obwohl nichts geprüft wird).
ALTER TABLE public.health_checks DROP CONSTRAINT IF EXISTS health_checks_ergebnis_check;
ALTER TABLE public.health_checks ADD CONSTRAINT health_checks_ergebnis_check
  CHECK (ergebnis IN ('ok', 'warnung', 'fehler', 'info'));

-- Alte Platzhalter-„ok“ des Canary-Checks ehrlich umschreiben (es wurde nie etwas geprüft)
UPDATE public.health_checks
SET ergebnis = 'info',
    details = coalesce(details, '{}'::jsonb) || '{"status":"nicht_eingerichtet"}'::jsonb
WHERE typ = 'canary_bewerbung' AND ergebnis = 'ok';
