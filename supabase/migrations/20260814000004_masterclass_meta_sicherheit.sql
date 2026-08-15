-- Masterclass Modul: Meta Sicherheit
-- Schütze dein Werbekonto vor Phishing und Hacker-Angriffen

DO $$
DECLARE
  v_module_id UUID;
  v_lesson_fake_id UUID;
  v_lesson_was_passiert_id UUID;
  v_lesson_schutz_id UUID;
  v_lesson_ernstfall_id UUID;
BEGIN

  -- 1. Modul anlegen
  INSERT INTO masterclass_modules (title, description, sort_order, published)
  VALUES (
    'Meta Sicherheit',
    'So schützt du dein Werbekonto vor Phishing, Hacks und Konto-Sperrungen',
    4,
    true
  )
  RETURNING id INTO v_module_id;

  -- 2. Lektion 1: Fake-Meldungen erkennen
  INSERT INTO masterclass_lessons (module_id, title, description, video_url, video_provider, duration_minutes, sort_order)
  VALUES (
    v_module_id,
    'Fake-Meldungen erkennen',
    'Meta schickt NIEMALS E-Mails mit Betreffzeilen wie "Dein Konto wird gesperrt" oder "Sofortige Maßnahme erforderlich". Lerne, wie du Phishing-Mails sofort erkennst.',
    NULL,
    'youtube',
    NULL,
    1
  )
  RETURNING id INTO v_lesson_fake_id;

  INSERT INTO lesson_tasks (lesson_id, title, description, sort_order) VALUES
    (v_lesson_fake_id,
     'Absender-Adresse prüfen',
     'Echte Meta-Mails kommen ausschließlich von @facebookmail.com — alles andere ist Phishing.',
     1),
    (v_lesson_fake_id,
     'Keine Links in verdächtigen E-Mails anklicken',
     'Öffne business.facebook.com immer direkt im Browser, nie über Links in E-Mails.',
     2),
    (v_lesson_fake_id,
     'Niemals Passwort auf externen Seiten eingeben',
     'Meta fragt dich nie auf einer Drittseite nach deinem Passwort.',
     3);

  -- 3. Lektion 2: Was passiert wenn man drauf reinfällt
  INSERT INTO masterclass_lessons (module_id, title, description, video_url, video_provider, duration_minutes, sort_order)
  VALUES (
    v_module_id,
    'Was passiert wenn man drauf reinfällt',
    'Hacker übernehmen das Werbekonto und schalten Anzeigen auf ihre eigenen Seiten. Das Konto kann komplett gesperrt werden — Wiederherstellung dauert oft Wochen und ist nicht garantiert.',
    NULL,
    'youtube',
    NULL,
    2
  )
  RETURNING id INTO v_lesson_was_passiert_id;

  -- keine Aufgaben für diese Lektion (reine Wissensvermittlung)

  -- 4. Lektion 3: Schutzmaßnahmen
  INSERT INTO masterclass_lessons (module_id, title, description, video_url, video_provider, duration_minutes, sort_order)
  VALUES (
    v_module_id,
    'Schutzmaßnahmen einrichten',
    'Schütze dein Konto mit Zwei-Faktor-Authentifizierung, einem starken Passwort und regelmäßigen Zugriffskontrollen.',
    NULL,
    'youtube',
    NULL,
    3
  )
  RETURNING id INTO v_lesson_schutz_id;

  INSERT INTO lesson_tasks (lesson_id, title, description, sort_order) VALUES
    (v_lesson_schutz_id,
     'Zwei-Faktor-Authentifizierung (2FA) aktivieren',
     'Gehe zu Business Manager → Sicherheitscenter und aktiviere 2FA für alle Admin-Accounts.',
     1),
    (v_lesson_schutz_id,
     'Starkes, einzigartiges Passwort setzen',
     'Verwende ein Passwort, das du nirgendwo sonst nutzt. Empfehlung: Passwort-Manager wie 1Password oder Bitwarden.',
     2),
    (v_lesson_schutz_id,
     'Zugang zum Business Manager prüfen',
     'Gehe zu Business Manager → Personen und entferne alle Personen, die keinen Zugriff mehr benötigen.',
     3),
    (v_lesson_schutz_id,
     'Backup-Werbekonto anlegen',
     'Nach 30 Tagen Kontoalter kannst du ein zweites Werbekonto anlegen — wichtige Absicherung falls das Hauptkonto gesperrt wird.',
     4);

  -- 5. Lektion 4: Was tun im Ernstfall
  INSERT INTO masterclass_lessons (module_id, title, description, video_url, video_provider, duration_minutes, sort_order)
  VALUES (
    v_module_id,
    'Was tun im Ernstfall',
    'Wenn dein Konto kompromittiert wurde: sofort handeln. Hier ist die Schritt-für-Schritt-Anleitung.',
    NULL,
    'youtube',
    NULL,
    4
  )
  RETURNING id INTO v_lesson_ernstfall_id;

  INSERT INTO lesson_tasks (lesson_id, title, description, sort_order) VALUES
    (v_lesson_ernstfall_id,
     'Sofort Passwort ändern',
     'Logge dich direkt über business.facebook.com ein und ändere dein Passwort umgehend.',
     1),
    (v_lesson_ernstfall_id,
     '2FA aktivieren falls noch nicht geschehen',
     'Stelle sicher, dass nach dem Passwort-Reset auch 2FA aktiv ist.',
     2),
    (v_lesson_ernstfall_id,
     'Zoepp Media sofort informieren',
     'Schreib uns direkt — wir helfen dir bei den nächsten Schritten und koordinieren den Support-Prozess.',
     3),
    (v_lesson_ernstfall_id,
     'Meta Support kontaktieren',
     'Gehe zu business.facebook.com/help und eröffne einen Support-Case. Screenshot des Problems vorher sichern.',
     4);

END $$;
