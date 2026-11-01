-- Audit-Log: Die Webhooks (Indeed-Apply, Generic) schreiben bei abgelehnter Signatur
-- entity_type 'webhook' + action 'reject'. Phase 5 hatte beide Werte erlaubt, die DSGVO-Migration
-- (20260921000050) hat die Checks ohne sie neu angelegt → jeder Eintrag schlug still fehl.
-- Alle übrigen Stellen schreiben nur erlaubte Werte (sprechende Aktion steht in changes.ereignis).
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_entity_type_check CHECK (entity_type IN (
  'candidate','agency','user','automation','template','pipeline_stage','consent','recording',
  'settings','job','application','export','webhook'
));

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN (
  'create','update','delete','access','impersonate','export','anonymize','reject'
));
