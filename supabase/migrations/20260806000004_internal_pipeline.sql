-- Phase 4: Internal task pipeline + AI conversations

-- 1. Internal task statuses
CREATE TYPE internal_task_status AS ENUM ('backlog', 'todo', 'in_progress', 'review', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- 2. Internal tasks
CREATE TABLE internal_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  status internal_task_status DEFAULT 'backlog',
  priority task_priority DEFAULT 'medium',
  due_date DATE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Task comments
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES internal_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. AI conversations
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  conversation_type TEXT NOT NULL CHECK (conversation_type IN ('ad_copy', 'script', 'funnel_text', 'general')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. AI messages
CREATE TABLE ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. RLS
ALTER TABLE internal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

-- Internal tasks: only admin/employee
CREATE POLICY "Internal users manage tasks" ON internal_tasks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );

CREATE POLICY "Internal users manage task comments" ON task_comments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );

CREATE POLICY "Internal users manage AI conversations" ON ai_conversations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );

CREATE POLICY "Internal users manage AI messages" ON ai_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );

-- 7. Indexes
CREATE INDEX idx_internal_tasks_agency ON internal_tasks(agency_id);
CREATE INDEX idx_internal_tasks_assigned ON internal_tasks(assigned_to);
CREATE INDEX idx_internal_tasks_status ON internal_tasks(status);
CREATE INDEX idx_task_comments_task ON task_comments(task_id);
CREATE INDEX idx_ai_conversations_agency ON ai_conversations(agency_id);
CREATE INDEX idx_ai_messages_conversation ON ai_messages(conversation_id);
