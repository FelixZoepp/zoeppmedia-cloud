-- Recruiting & Bewerber-Framing Masterclass Module + 13 Lessons

-- Insert the module
INSERT INTO masterclass_modules (title, description, sort_order, published) VALUES
  ('Recruiting & Bewerber-Framing', 'Lerne den kompletten Recruiting-Funnel, Framings und Skripte für Erstgespräch bis Probetag', 10, true);

-- Insert lessons using a CTE to grab the module ID
WITH mod AS (
  SELECT id FROM masterclass_modules WHERE title = 'Recruiting & Bewerber-Framing' LIMIT 1
)
INSERT INTO masterclass_lessons (module_id, title, description, sort_order) VALUES
  ((SELECT id FROM mod), 'Recruiting-Funnel Überblick', 'Verstehe den kompletten Funnel von der Bewerbung bis zur Einstellung', 1),
  ((SELECT id FROM mod), 'Erstkontakt & Gesprächseröffnung', 'So startest du das erste Telefonat professionell', 2),
  ((SELECT id FROM mod), 'Qualifizierungsfragen', 'Die richtigen Fragen, um Bewerber schnell einzuschätzen', 3),
  ((SELECT id FROM mod), 'VG closen', 'So lädst du zum Vorstellungsgespräch ein', 4),
  ((SELECT id FROM mod), 'Einkommens-Framing', 'Wie du das Einkommenspotenzial richtig vermittelst', 5),
  ((SELECT id FROM mod), 'Social Proof (Jürgen)', 'Echte Erfolgsgeschichten als Überzeugungsinstrument', 6),
  ((SELECT id FROM mod), 'Zoom-Framing & Professionalität', 'Dein Setup und Auftreten im Zoom-Call', 7),
  ((SELECT id FROM mod), 'Ziel- und Schmerz-Fragen', 'Gap zwischen Ist und Soll aufzeigen', 8),
  ((SELECT id FROM mod), 'Probetag closen', 'So terminierst du den Probetag verbindlich', 9),
  ((SELECT id FROM mod), 'Follow-up & Handoff', 'Übergabe und Nachbereitung nach dem Gespräch', 10),
  ((SELECT id FROM mod), 'Showrate-Diagnose', 'Warum Bewerber nicht erscheinen und was du dagegen tust', 11),
  ((SELECT id FROM mod), 'Recruiter-Scorecard', 'Bewerber objektiv bewerten mit dem Scorecard-System', 12),
  ((SELECT id FROM mod), 'Praxisübung & Analyse', 'Wende alles Gelernte in einer praxisnahen Übung an', 13);
