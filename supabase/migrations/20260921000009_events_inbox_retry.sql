-- Phase 2 / Task 6 Review: retry_at-Spalte und aktualisierte Claim-Funktion mit Backoff-Guard.

-- C1-1: retry_at für zeitgesteuerten Backoff
ALTER TABLE events_inbox ADD COLUMN retry_at timestamptz;

-- C1-2: claim_inbox_events: ignoriert Zeilen, deren retry_at noch in der Zukunft liegt.
-- SECURITY DEFINER + SET search_path = public damit RLS umgangen wird (Service Role Cron).
CREATE OR REPLACE FUNCTION claim_inbox_events(batch_size int DEFAULT 100)
RETURNS SETOF events_inbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE events_inbox
  SET status = 'processing', attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM events_inbox
    WHERE status = 'pending'
      AND (retry_at IS NULL OR retry_at <= now())
    ORDER BY received_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Rechte zurücksetzen (CREATE OR REPLACE setzt Grants nicht zurück — explizit sicherstellen)
REVOKE EXECUTE ON FUNCTION claim_inbox_events(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_inbox_events(int) TO service_role;

-- C1-3 / C4: increment_unread — atomare Server-seitige Inkrementierung, kein Client-seitiges +1
CREATE OR REPLACE FUNCTION increment_unread(conversation_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE conversations
  SET unread_count = unread_count + 1,
      updated_at   = now()
  WHERE id = conversation_id;
$$;

REVOKE EXECUTE ON FUNCTION increment_unread(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_unread(uuid) TO service_role;
