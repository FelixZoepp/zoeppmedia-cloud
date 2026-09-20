-- ICS SEQUENCE-Zähler für Kalender-Einladungen (Updates/Absagen brauchen höhere Sequence)
ALTER TABLE candidate_appointments ADD COLUMN IF NOT EXISTS ics_sequence INT NOT NULL DEFAULT 0;
