-- Termindauer 0 ließ die Slot-Berechnung endlos laufen. Bestehende Ausreißer korrigieren, dann absichern.
UPDATE jobs SET appointment_duration_minutes = 30
WHERE appointment_duration_minutes IS NOT NULL AND (appointment_duration_minutes < 5 OR appointment_duration_minutes > 480);
UPDATE jobs SET appointment_buffer_minutes = 15
WHERE appointment_buffer_minutes IS NOT NULL AND (appointment_buffer_minutes < 0 OR appointment_buffer_minutes > 240);

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_appointment_duration_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_appointment_duration_check
  CHECK (appointment_duration_minutes IS NULL OR appointment_duration_minutes BETWEEN 5 AND 480);
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_appointment_buffer_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_appointment_buffer_check
  CHECK (appointment_buffer_minutes IS NULL OR appointment_buffer_minutes BETWEEN 0 AND 240);
