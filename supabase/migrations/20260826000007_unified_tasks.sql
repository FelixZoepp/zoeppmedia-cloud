-- Unified task view across all task subsystems
CREATE OR REPLACE VIEW unified_tasks AS
SELECT
  id,
  'internal' AS task_source,
  title,
  agency_id,
  assigned_to,
  status::text,
  priority::text,
  due_date,
  NULL::uuid AS candidate_id,
  NULL::integer AS sla_minutes,
  created_at
FROM internal_tasks
UNION ALL
SELECT
  id,
  'fulfillment' AS task_source,
  title,
  agency_id,
  assigned_to,
  status::text,
  CASE WHEN status = 'pending' THEN 'medium' ELSE 'low' END AS priority,
  NULL::date AS due_date,
  NULL::uuid AS candidate_id,
  NULL::integer AS sla_minutes,
  created_at
FROM fulfillment_tasks
UNION ALL
SELECT
  id,
  'playbook' AS task_source,
  action_text AS title,
  agency_id,
  assigned_to,
  status::text,
  CASE WHEN action_type = 'immediate' THEN 'high' ELSE 'medium' END AS priority,
  NULL::date AS due_date,
  NULL::uuid AS candidate_id,
  NULL::integer AS sla_minutes,
  created_at
FROM playbook_tasks
UNION ALL
SELECT
  id,
  'client' AS task_source,
  title,
  agency_id,
  created_by AS assigned_to,
  CASE WHEN completed THEN 'done' ELSE 'pending' END AS status,
  'medium' AS priority,
  due_date,
  NULL::uuid AS candidate_id,
  NULL::integer AS sla_minutes,
  created_at
FROM client_tasks
UNION ALL
SELECT
  id,
  'recurring' AS task_source,
  title,
  agency_id,
  assigned_to,
  status::text,
  CASE WHEN status = 'pending' THEN 'medium' ELSE 'low' END AS priority,
  due_date,
  NULL::uuid AS candidate_id,
  NULL::integer AS sla_minutes,
  created_at
FROM recurring_fulfillment_tasks
UNION ALL
SELECT
  ct.id,
  'customer' AS task_source,
  st.title,
  ct.agency_id,
  ct.assigned_to,
  ct.status::text,
  'medium' AS priority,
  NULL::date AS due_date,
  NULL::uuid AS candidate_id,
  NULL::integer AS sla_minutes,
  ct.created_at
FROM customer_tasks ct
JOIN sop_tasks st ON st.id = ct.sop_task_id;

-- SLA tracking table for time-sensitive tasks
CREATE TABLE task_sla (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_source TEXT NOT NULL,
  task_id UUID NOT NULL,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id),
  sla_minutes INTEGER NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  escalation_level INTEGER DEFAULT 0,
  escalated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_sla_due ON task_sla(due_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_task_sla_assigned ON task_sla(assigned_to);

ALTER TABLE task_sla ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users see all SLAs" ON task_sla FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Agency users see own SLAs" ON task_sla FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Service manages SLAs" ON task_sla FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
