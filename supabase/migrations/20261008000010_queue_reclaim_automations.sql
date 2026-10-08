-- Review 2026-10-08: Queue-Reclaim, Automations-Schema, offene Automations-Policies

-- 1) Hängende 'processing'-Zeilen zurückholen.
--    Bricht Vercel den Tick mitten in einem Worker ab, blieb die Zeile für immer auf 'processing'.
--    claimed_at merkt sich den Claim-Zeitpunkt; nach 5 Minuten darf erneut geclaimt werden.
--    Nur Claims der letzten 2 Stunden und höchstens 5 Versuche — alte Leichen werden nicht
--    wiederbelebt (kein Rückstau an Nachrichten nach dem Deploy).
ALTER TABLE scheduled_jobs ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE events_inbox ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE OR REPLACE FUNCTION claim_inbox_events(batch_size int DEFAULT 100)
RETURNS SETOF events_inbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE events_inbox
  SET status = 'processing', attempts = attempts + 1, claimed_at = now()
  WHERE id IN (
    SELECT id FROM events_inbox
    WHERE (
        status = 'pending'
        AND (retry_at IS NULL OR retry_at <= now())
      ) OR (
        status = 'processing'
        AND claimed_at < now() - interval '5 minutes'
        AND claimed_at > now() - interval '2 hours'
        AND attempts < 5
      )
    ORDER BY received_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION claim_due_jobs(batch_size int DEFAULT 100)
RETURNS SETOF scheduled_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE scheduled_jobs
  SET status = 'processing', attempts = attempts + 1, updated_at = now(), claimed_at = now()
  WHERE id IN (
    SELECT id FROM scheduled_jobs
    WHERE (
        status = 'pending' AND run_at <= now()
      ) OR (
        status = 'processing'
        AND claimed_at < now() - interval '5 minutes'
        AND claimed_at > now() - interval '2 hours'
        AND attempts < 5
      )
    ORDER BY run_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_inbox_events(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_inbox_events(int) TO service_role;
REVOKE EXECUTE ON FUNCTION claim_due_jobs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_due_jobs(int) TO service_role;

-- 2) automation_runs: application_id fehlte (Rate-Limit-Abfrage und Logs scheiterten still),
--    'running' für den atomaren Dedupe-Anspruch vor den Aktionen.
ALTER TABLE automation_runs
  ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES applications(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_automation_runs_application
  ON automation_runs (agency_id, application_id, created_at DESC)
  WHERE application_id IS NOT NULL;

ALTER TABLE automation_runs DROP CONSTRAINT IF EXISTS automation_runs_status_check;
ALTER TABLE automation_runs
  ADD CONSTRAINT automation_runs_status_check CHECK (status IN ('running', 'success', 'failed', 'skipped'));

-- 3) Trigger-Events: der Code feuert inzwischen auch Punkt-Events (bot.completed, appointment.no_show, …)
ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_trigger_event_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_event_check CHECK (trigger_event IN (
  'candidate_created', 'stage_changed', 'call_logged',
  'noshow_recorded', 'opt_out', 'task_overdue',
  'appointment_created', 'appointment_cancelled',
  'candidate_idle', 'manual',
  'application.created', 'message.received',
  'bot.completed', 'bot.handover',
  'appointment.booked', 'appointment.cancelled', 'appointment.no_show'
));

-- 4) "Service manages …"-Policies galten ohne TO-Rolle für alle (auch anon/authenticated):
--    jeder eingeloggte Nutzer konnte Automationen und Run-Logs aller Kunden lesen und ändern.
--    Die Service-Role umgeht RLS ohnehin, die Policies sind überflüssig.
DROP POLICY IF EXISTS "Service manages automations" ON automations;
DROP POLICY IF EXISTS "Service manages runs" ON automation_runs;
