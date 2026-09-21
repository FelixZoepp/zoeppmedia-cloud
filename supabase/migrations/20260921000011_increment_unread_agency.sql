-- C3: increment_unread mit agency_id-Parameter für Mandanten-Scoping.
-- Ersetzt die alte Signatur (uuid) durch (uuid, uuid).

DROP FUNCTION IF EXISTS increment_unread(uuid);

CREATE OR REPLACE FUNCTION increment_unread(p_conversation_id uuid, p_agency_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE conversations
  SET unread_count = unread_count + 1
  WHERE id = p_conversation_id
    AND agency_id = p_agency_id;
$$;

REVOKE EXECUTE ON FUNCTION increment_unread(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_unread(uuid, uuid) TO service_role;
