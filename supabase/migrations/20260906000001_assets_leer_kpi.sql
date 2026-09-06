-- Asset-Halde: KPI + Playbook-Eintrag für assets_leer-Alert
INSERT INTO kpi_defaults (kpi_key, label, default_value, unit, direction)
VALUES ('min_assets_ready', 'Min. aktivierbare Assets auf Halde', 2, 'Assets', 'higher_is_better')
ON CONFLICT (kpi_key) DO NOTHING;

INSERT INTO playbook_entries (problem_key, title, description, causes, immediate_actions, long_term_actions, escalation_trigger)
VALUES (
  'assets_leer',
  'Asset-Halde ist leer',
  'Weniger als 2 freigegebene, aktivierbare Inhalte auf der Halde. Ohne Nachschub droht Ad Fatigue.',
  ARRAY['Content-Produktion hängt hinterher', 'Freigaben stauen sich (intern oder beim Kunden)', 'Kein Generierungs-Rhythmus etabliert'],
  ARRAY['Neue Ad-Copy- und Creative-Varianten generieren (min. 3)', 'Offene Freigaben in der Batch-Ansicht abarbeiten', 'Kunde an ausstehende Kundenfreigaben erinnern'],
  ARRAY['Wöchentlichen Generierungs-Slot einplanen', 'Freigabe-SLA mit Kunde vereinbaren (48h)'],
  'Halde länger als 5 Tage leer → Content-Sprint einplanen'
) ON CONFLICT (problem_key) DO NOTHING;
