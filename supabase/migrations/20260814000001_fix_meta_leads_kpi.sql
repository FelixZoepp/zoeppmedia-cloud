-- Fix: add missing min_meta_leads_5days KPI that was added via Node script but not in migrations
INSERT INTO kpi_defaults (kpi_key, label, default_value, unit, direction)
VALUES ('min_meta_leads_5days', 'Meta Min 5 Leads in 5 Tagen', 5, 'Leads', 'higher_is_better')
ON CONFLICT (kpi_key) DO NOTHING;

-- Also add playbook entry for low_meta_leads if missing
INSERT INTO playbook_entries (problem_key, title, description, causes, immediate_actions, long_term_actions, escalation_trigger)
VALUES (
  'low_meta_leads',
  'Meta Ads liefern zu wenig Leads',
  'Weniger als 5 Meta-Leads in den ersten 5 Tagen.',
  ARRAY['Zielgruppe zu breit oder falsch', 'Creative spricht Zielgruppe nicht an', 'Funnel-Conversion zu niedrig', 'Budget zu gering', 'Anzeige wurde abgelehnt'],
  ARRAY['Kampagne auf Fehler prüfen (abgelehnte Ads, Billing)', 'Zielgruppe einengen (Alter, Region, Interessen)', 'Creative-Varianten testen (min. 3 aktiv)', 'Funnel-Conversion prüfen (< 10% = Problem)', 'Budget auf min. 30 Euro/Tag setzen'],
  ARRAY['Lookalike-Audience aufbauen', 'Retargeting-Kampagne parallel schalten', 'Wöchentliche A/B-Tests einführen'],
  'Nach 7 Tagen unter 5 Leads → Budget pausieren und komplett reviewen'
) ON CONFLICT (problem_key) DO NOTHING;
