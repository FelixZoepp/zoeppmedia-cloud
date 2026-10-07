-- Masterclass-Videos auch aus Google Drive einbetten
ALTER TABLE masterclass_lessons DROP CONSTRAINT IF EXISTS masterclass_lessons_video_provider_check;
ALTER TABLE masterclass_lessons ADD CONSTRAINT masterclass_lessons_video_provider_check
  CHECK (video_provider IN ('youtube', 'vimeo', 'loom', 'drive'));
