-- Phase 4: Termine, Reminder-Katalog, Automations v2 (Spec §4, §11, §16)

-- 1. appointments (P4-R1, P4-R5, P4-R7)
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  starts_at timestamptz,
  ends_at timestamptz,
  type text NOT NULL DEFAULT 'call' CHECK (type IN ('call','video','onsite')),
  location text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','booked','confirmed','no_show','done','cancelled')),
  booked_via text,
  booking_token uuid UNIQUE DEFAULT gen_random_uuid(),
  token_expires_at timestamptz,
  ics_sequence int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_appointments_agency_starts ON appointments(agency_id, starts_at);
-- P4-R5 (korrigiert): Doppelbuchungsschutz — ein Kalender je Agentur, verhindert zwei Buchungen zum selben Zeitpunkt
CREATE UNIQUE INDEX idx_appointments_no_double_book
  ON appointments(agency_id, starts_at)
  WHERE status IN ('booked','confirmed');
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointments select" ON appointments FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "appointments write" ON appointments FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 2. availability_rules (P4-R4)
CREATE TABLE availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (start_time < end_time)
);
CREATE INDEX idx_availability_rules_job ON availability_rules(job_id);
ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "availability_rules select" ON availability_rules FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "availability_rules write" ON availability_rules FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 3. Job-Spalten für Terminart/Dauer/Puffer/Ort (P4-R4)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS appointment_type text NOT NULL DEFAULT 'call' CHECK (appointment_type IN ('call','video','onsite'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS appointment_location text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS appointment_duration_minutes int NOT NULL DEFAULT 30;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS appointment_buffer_minutes int NOT NULL DEFAULT 15;

-- 4. pipeline_stages: requires_documents (P4-R14)
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS requires_documents boolean NOT NULL DEFAULT false;

-- 5. automation_runs: dedupe_key für Doppelversand-Schutz (P4-R9)
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX idx_automation_runs_dedupe ON automation_runs(dedupe_key) WHERE dedupe_key IS NOT NULL;
