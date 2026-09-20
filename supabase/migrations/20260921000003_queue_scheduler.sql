-- Phase 0 / Spec Abschn. 3+11: Queue + Scheduler. Zugriff nur über Service Role.
CREATE TABLE events_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_id text,
  agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed','dead')),
  attempts int NOT NULL DEFAULT 0,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE UNIQUE INDEX uq_events_inbox_source_ext ON events_inbox(source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_events_inbox_due ON events_inbox(status, received_at);
ALTER TABLE events_inbox ENABLE ROW LEVEL SECURITY;

CREATE TABLE scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES agencies(id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed','dead','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_scheduled_jobs_dedupe ON scheduled_jobs(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX idx_scheduled_jobs_due ON scheduled_jobs(status, run_at);
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
