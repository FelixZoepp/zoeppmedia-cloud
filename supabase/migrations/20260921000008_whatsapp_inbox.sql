-- Phase 2 / Spec Abschn. 4+7+9: WhatsApp-Tabellen, Conversations, Messages, Quick Replies.

-- 1. whatsapp_accounts
CREATE TABLE whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL,
  display_number text,
  access_token_enc text NOT NULL,
  provider text NOT NULL DEFAULT 'cloud_api',
  quality_rating text,
  messaging_limit text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','disconnected','banned')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_accounts_agency ON whatsapp_accounts(agency_id);
CREATE UNIQUE INDEX uq_wa_accounts_phone ON whatsapp_accounts(phone_number_id);
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_accounts select" ON whatsapp_accounts FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "wa_accounts write" ON whatsapp_accounts FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 2. whatsapp_templates
CREATE TABLE whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  wa_account_id uuid NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'de',
  category text NOT NULL DEFAULT 'UTILITY',
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]',
  buttons jsonb,
  meta_template_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paused','deleted')),
  preset_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_templates_account ON whatsapp_templates(wa_account_id);
CREATE INDEX idx_wa_templates_agency ON whatsapp_templates(agency_id);
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_templates select" ON whatsapp_templates FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "wa_templates write" ON whatsapp_templates FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 3. conversations
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  wa_account_id uuid NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'bot_active' CHECK (state IN ('bot_active','human_active','waiting','closed')),
  bot_step int NOT NULL DEFAULT 0,
  window_expires_at timestamptz,
  unread_count int NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_conversations_account_candidate ON conversations(wa_account_id, candidate_id);
CREATE INDEX idx_conversations_agency_last ON conversations(agency_id, last_message_at DESC);
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations select" ON conversations FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "conversations write" ON conversations FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 4. messages
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  sender_type text NOT NULL CHECK (sender_type IN ('candidate','bot','user','system')),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text','template','image','document','audio','interactive')),
  body text,
  media_path text,
  wa_message_id text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','read','failed')),
  error_code text,
  template_id uuid REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  cost_category text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_messages_wa_id ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX idx_messages_conversation_time ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_agency ON messages(agency_id);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages select" ON messages FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "messages write" ON messages FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 5. quick_replies
CREATE TABLE quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  shortcut text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quick_replies select" ON quick_replies FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "quick_replies write" ON quick_replies FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 6. Realtime aktivieren
ALTER PUBLICATION supabase_realtime ADD TABLE messages, conversations;

-- 7. Claim-Funktionen fuer den Tick-Cron (atomar, skip locked)
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
  SET status = 'processing', attempts = attempts + 1, updated_at = now()
  WHERE id IN (
    SELECT id FROM scheduled_jobs
    WHERE status = 'pending' AND run_at <= now()
    ORDER BY run_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Nur Service Role darf die Claim-Funktionen ausfuehren (SECURITY DEFINER umgeht RLS)
REVOKE EXECUTE ON FUNCTION claim_inbox_events(int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION claim_due_jobs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_inbox_events(int) TO service_role;
GRANT EXECUTE ON FUNCTION claim_due_jobs(int) TO service_role;

-- 8. Storage-Bucket fuer WhatsApp-Medien (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('whatsapp-media', 'whatsapp-media', false)
ON CONFLICT (id) DO NOTHING;

-- Ruling R1: NotificationType um 'whatsapp_inbound' erweitern (TS-Union folgt in Task 6)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_candidate', 'stage_change', 'call_result', 'task_assigned',
    'task_due', 'sla_breach', 'noshow', 'opt_out', 'system', 'whatsapp_inbound'
  ));
