-- Phase 3: Masterclass system + client tasks

-- 1. Masterclass modules
CREATE TABLE masterclass_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Masterclass lessons
CREATE TABLE masterclass_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES masterclass_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  video_provider TEXT CHECK (video_provider IN ('youtube', 'vimeo')) DEFAULT 'youtube',
  duration_minutes INTEGER,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Lesson tasks (template tasks per lesson)
CREATE TABLE lesson_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES masterclass_lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0
);

-- 4. Agency lesson progress
CREATE TABLE agency_lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES masterclass_lessons(id) ON DELETE CASCADE,
  watched BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE(agency_id, lesson_id)
);

-- 5. Agency task progress
CREATE TABLE agency_task_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES lesson_tasks(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE(agency_id, task_id)
);

-- 6. Client tasks (standalone tasks for agencies)
CREATE TABLE client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. RLS
ALTER TABLE masterclass_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE masterclass_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;

-- Modules/lessons/lesson_tasks: public read, admin write
CREATE POLICY "Anyone can read modules" ON masterclass_modules FOR SELECT USING (true);
CREATE POLICY "Admins manage modules" ON masterclass_modules FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Anyone can read lessons" ON masterclass_lessons FOR SELECT USING (true);
CREATE POLICY "Admins manage lessons" ON masterclass_lessons FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Anyone can read lesson tasks" ON lesson_tasks FOR SELECT USING (true);
CREATE POLICY "Admins manage lesson tasks" ON lesson_tasks FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Progress: agency users manage own, admins read all
CREATE POLICY "Agency users manage own lesson progress" ON agency_lesson_progress
  FOR ALL USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );

CREATE POLICY "Agency users manage own task progress" ON agency_task_progress
  FOR ALL USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );

-- Client tasks: agency users read own, admins/employees manage
CREATE POLICY "Agency users read own tasks" ON client_tasks
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Internal users manage client tasks" ON client_tasks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );

CREATE POLICY "Agency users complete own tasks" ON client_tasks
  FOR UPDATE USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- 8. Indexes
CREATE INDEX idx_lessons_module ON masterclass_lessons(module_id);
CREATE INDEX idx_lesson_tasks_lesson ON lesson_tasks(lesson_id);
CREATE INDEX idx_lesson_progress_agency ON agency_lesson_progress(agency_id);
CREATE INDEX idx_task_progress_agency ON agency_task_progress(agency_id);
CREATE INDEX idx_client_tasks_agency ON client_tasks(agency_id);

-- 9. Seed some initial masterclass content
INSERT INTO masterclass_modules (title, description, sort_order, published) VALUES
  ('Willkommen', 'Erste Schritte mit der Zoepp Media Cloud', 1, true),
  ('Bewerber-Management', 'So arbeitest du effektiv mit deiner Pipeline', 2, true),
  ('Recruiting-Prozess', 'Der perfekte Ablauf vom Lead zum neuen Mitarbeiter', 3, true);
