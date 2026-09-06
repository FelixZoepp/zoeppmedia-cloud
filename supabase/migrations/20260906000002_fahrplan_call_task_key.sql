-- Betreuungsstufen A/B: Fahrplan-Call als wiederkehrende Aufgabe erlauben
ALTER TABLE recurring_fulfillment_tasks
  DROP CONSTRAINT IF EXISTS recurring_fulfillment_tasks_task_key_check;

ALTER TABLE recurring_fulfillment_tasks
  ADD CONSTRAINT recurring_fulfillment_tasks_task_key_check CHECK (task_key IN (
    'indeed_restart', 'creatives_test', 'reels_create', 'video_shoot_plan', 'fahrplan_call'
  ));
