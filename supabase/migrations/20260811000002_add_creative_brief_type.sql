-- Add creative_brief to content_library and sop_tasks content_type constraints
ALTER TABLE content_library DROP CONSTRAINT IF EXISTS content_library_content_type_check;
ALTER TABLE content_library ADD CONSTRAINT content_library_content_type_check
  CHECK (content_type IN ('ad_copy', 'phone_script', 'video_script', 'funnel_text', 'job_posting', 'creative_brief'));

ALTER TABLE sop_tasks DROP CONSTRAINT IF EXISTS sop_tasks_ai_content_type_check;
ALTER TABLE sop_tasks ADD CONSTRAINT sop_tasks_ai_content_type_check
  CHECK (ai_content_type IN ('ad_copy', 'phone_script', 'video_script', 'funnel_text', 'job_posting', 'creative_brief', NULL));
