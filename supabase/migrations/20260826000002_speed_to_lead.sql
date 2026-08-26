-- Track first contact timestamps on candidates
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS first_dial_at TIMESTAMPTZ;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMPTZ;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS ttfc_seconds INTEGER;

-- Backfill first_dial_at from call_logs (earliest call per candidate)
UPDATE candidates c SET first_dial_at = sub.first_call
FROM (
  SELECT candidate_id, MIN(created_at) AS first_call
  FROM call_logs
  GROUP BY candidate_id
) sub
WHERE c.id = sub.candidate_id AND c.first_dial_at IS NULL;

-- Backfill first_contact_at from call_logs where result indicates contact was made
UPDATE candidates c SET first_contact_at = sub.first_contact
FROM (
  SELECT candidate_id, MIN(created_at) AS first_contact
  FROM call_logs
  WHERE result IN ('termin_vereinbart', 'kein_interesse', 'rueckruf', 'sonstiges')
  GROUP BY candidate_id
) sub
WHERE c.id = sub.candidate_id AND c.first_contact_at IS NULL;

-- Calculate ttfc_seconds
UPDATE candidates
SET ttfc_seconds = EXTRACT(EPOCH FROM (first_contact_at - created_at))::int
WHERE first_contact_at IS NOT NULL AND ttfc_seconds IS NULL;

-- View for TTFC stats per agency
CREATE OR REPLACE VIEW ttfc_stats AS
SELECT
  c.agency_id,
  COUNT(*) AS total_candidates,
  COUNT(c.first_dial_at) AS dialed,
  COUNT(c.first_contact_at) AS contacted,
  ROUND(AVG(EXTRACT(EPOCH FROM (c.first_dial_at - c.created_at))))::int AS avg_time_to_first_dial,
  ROUND(AVG(EXTRACT(EPOCH FROM (c.first_contact_at - c.created_at))))::int AS avg_ttfc,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (c.first_contact_at - c.created_at))) AS median_ttfc,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (c.first_contact_at - c.created_at))) AS p90_ttfc,
  COUNT(CASE WHEN EXTRACT(EPOCH FROM (c.first_contact_at - c.created_at)) <= 900 THEN 1 END) AS under_15min,
  COUNT(CASE WHEN EXTRACT(EPOCH FROM (c.first_contact_at - c.created_at)) > 900 AND EXTRACT(EPOCH FROM (c.first_contact_at - c.created_at)) <= 14400 THEN 1 END) AS under_4h,
  COUNT(CASE WHEN EXTRACT(EPOCH FROM (c.first_contact_at - c.created_at)) > 14400 THEN 1 END) AS over_4h
FROM candidates c
WHERE c.created_at > now() - interval '90 days'
GROUP BY c.agency_id;
