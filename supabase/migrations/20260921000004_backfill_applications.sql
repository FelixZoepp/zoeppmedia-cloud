-- Phase 0 / Integrations-Design: Bestandskandidaten -> applications (Modell A).
INSERT INTO jobs (agency_id, title, slug, status, is_default, employment_type)
SELECT id, 'Vertriebsmitarbeiter (D2D)', 'vertriebsmitarbeiter-d2d', 'active', true, 'Vollzeit'
FROM agencies
ON CONFLICT (agency_id, slug) DO NOTHING;

INSERT INTO applications (agency_id, candidate_id, job_id, stage_id, source, applied_at, created_at, status)
SELECT
  c.agency_id, c.id, j.id, c.current_stage_id, c.source, c.created_at, c.created_at,
  CASE WHEN ps.stage_type = 'hired' THEN 'hired'
       WHEN ps.stage_type = 'rejected' THEN 'rejected'
       ELSE 'open' END
FROM candidates c
JOIN jobs j ON j.agency_id = c.agency_id AND j.is_default
LEFT JOIN pipeline_stages ps ON ps.id = c.current_stage_id
WHERE NOT EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = c.id);
