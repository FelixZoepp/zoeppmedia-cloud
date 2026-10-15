-- Zweite Masterclass „Führungskräfte“: Führungskräfte des Kunden lernen, selbst zu rekrutieren, und werden von uns ausgebildet.
-- Module bekommen einen Bereich (ceo = bisherige Masterclass, fuehrung = neue). Zugriff auf „fuehrung“ nur mit
-- Freischaltung je Person (setzt ein Admin). Fortschritt dort je Person statt je Kunde.
-- Inhalte unten sind ENTWÜRFE (Module unveröffentlicht, Lektionen „entwurf“) – sichtbar erst nach Freigabe durch Felix.

alter table masterclass_modules add column if not exists bereich text not null default 'ceo';
alter table masterclass_modules drop constraint if exists masterclass_modules_bereich_check;
alter table masterclass_modules add constraint masterclass_modules_bereich_check check (bereich in ('ceo', 'fuehrung'));

create table if not exists masterclass_freischaltungen (
  user_id uuid primary key references users(id) on delete cascade,
  agency_id uuid not null references agencies(id) on delete cascade,
  freigeschaltet_von uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_mc_freischaltungen_agency on masterclass_freischaltungen(agency_id);
alter table masterclass_freischaltungen enable row level security;

create table if not exists masterclass_user_progress (
  user_id uuid not null references users(id) on delete cascade,
  lesson_id uuid not null references masterclass_lessons(id) on delete cascade,
  watched boolean not null default false,
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);
alter table masterclass_user_progress enable row level security;

create table if not exists masterclass_user_task_progress (
  user_id uuid not null references users(id) on delete cascade,
  task_id uuid not null references lesson_tasks(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  primary key (user_id, task_id)
);
alter table masterclass_user_task_progress enable row level security;
-- Nur der Server (Service-Rolle) liest und schreibt diese drei Tabellen

-- ── Entwürfe ────────────────────────────────────────────────────────────────
do $$
declare
  m uuid;
  n int;
begin
  if exists (select 1 from masterclass_modules where title = 'Deine Führungskräfte rekrutieren selbst') then
    return;
  end if;

  -- Teaser in der CEO-Masterclass
  select coalesce(max(sort_order), 0) + 1 into n from masterclass_modules where bereich = 'ceo';
  insert into masterclass_modules (title, description, sort_order, published, bereich)
  values ('Deine Führungskräfte rekrutieren selbst', 'Wachstum, das nicht mehr an dir hängt – und warum es sich mit den ersten zwei Vertrieblern bezahlt macht.', n, false, 'ceo')
  returning id into m;
  insert into masterclass_lessons (module_id, title, description, typ, status, sort_order, duration_minutes, content_html) values
  (m, 'Warum Wachstum nicht an dir hängen darf', 'Solange nur du rekrutierst, ist dein Kalender die Wachstumsgrenze.', 'video', 'entwurf', 1, 6,
   '<p>Solange du als Inhaber jeden neuen Vertriebler selbst findest, anrufst und einarbeitest, wächst dein Team nur so schnell, wie dein Kalender es zulässt.</p><h3>Was sich ändert, wenn deine Führungskräfte selbst rekrutieren</h3><ul><li>Jede Führungskraft baut ihr eigenes Team auf – parallel statt nacheinander.</li><li>Bewerber werden in Minuten angerufen, nicht erst, wenn du Zeit hast.</li><li>Du steuerst über Zahlen, statt jedes Gespräch selbst zu führen.</li></ul><p>Genau dafür gibt es die <strong>Masterclass für Führungskräfte</strong>: Wir bilden deine Führungskräfte aus, damit sie selbst rekrutieren – mit demselben System, das du hier lernst.</p>'),
  (m, 'Die Rechnung: Ab dem zweiten Vertriebler bezahlt', 'Warum sich die Ausbildung deiner Führungskräfte sofort trägt.', 'video', 'entwurf', 2, 5,
   '<p>Rechne es mit deinen eigenen Zahlen durch:</p><ol><li>Was bringt dir ein eingearbeiteter Vertriebler im Monat an Deckungsbeitrag?</li><li>Wie viele Vertriebler könnte jede deiner Führungskräfte im Quartal selbst gewinnen, wenn sie das System beherrscht?</li><li>Multipliziere das mit der Zahl deiner Führungskräfte.</li></ol><p>Bei unseren Kunden zeigt sich immer wieder: <strong>Schon die ersten zwei Vertriebler, die deine Führungskräfte selbst gewinnen, holen die Investition wieder rein.</strong> Alles danach ist zusätzliches Wachstum.</p><h3>Nächster Schritt</h3><p>Sprich uns im nächsten Termin an, welche Führungskräfte starten sollen – wir schalten ihnen die Masterclass frei und begleiten sie persönlich.</p>');

  -- Masterclass für Führungskräfte
  insert into masterclass_modules (title, description, sort_order, published, bereich)
  values ('Deine Rolle als rekrutierende Führungskraft', 'Warum du selbst rekrutierst und wie wir dich dabei ausbilden.', 1, false, 'fuehrung')
  returning id into m;
  insert into masterclass_lessons (module_id, title, description, typ, status, sort_order, duration_minutes, content_html) values
  (m, 'Willkommen: So bilden wir dich aus', 'Ablauf der Ausbildung, Live-Coachings und was wir von dir erwarten.', 'video', 'entwurf', 1, 8,
   '<p>In dieser Masterclass lernst du, dein Team selbst aufzubauen. Wir begleiten dich dabei persönlich.</p><h3>So läuft die Ausbildung</h3><ul><li>Lektionen in deinem Tempo – jede mit einer konkreten Aufgabe für deinen Alltag.</li><li>Regelmäßige Live-Coachings mit unserem Team.</li><li>Wir hören uns deine echten Erstgespräche an und geben dir Feedback.</li></ul>'),
  (m, 'Warum Wachstum aus deinem Team kommt', 'Dein Team ist dein Hebel – nicht deine eigenen Abschlüsse.', 'video', 'entwurf', 2, 6,
   '<p>Als Führungskraft wächst du nicht mehr über eigene Abschlüsse, sondern über die Menschen, die du gewinnst und entwickelst. Jeder gute Vertriebler, den du selbst rekrutierst, vervielfacht deine Wirkung.</p>');

  insert into masterclass_modules (title, description, sort_order, published, bereich)
  values ('Die richtigen Leute finden', 'Profil, Kanäle und wie Bewerber zu dir kommen.', 2, false, 'fuehrung')
  returning id into m;
  insert into masterclass_lessons (module_id, title, description, typ, status, sort_order, duration_minutes, content_html) values
  (m, 'Wen du wirklich suchst', 'Das Profil eines Vertrieblers, der bei euch erfolgreich wird.', 'video', 'entwurf', 1, 10,
   '<p>Schreib auf, was deine besten Vertriebler gemeinsam haben: Antrieb, Lebenssituation, Erfahrung. Daraus entsteht dein Suchprofil – und die Fragen für das Erstgespräch.</p>'),
  (m, 'Woher deine Bewerber kommen', 'Funnel, Empfehlungen, eigenes Netzwerk – und wie du jeden Kanal nutzt.', 'video', 'entwurf', 2, 8,
   '<p>Die meisten Bewerber kommen über den Funnel, den wir für euch betreiben. Dazu kommen Empfehlungen aus deinem Team und dein eigenes Netzwerk. Wir zeigen dir, wie du jeden Kanal aktiv nutzt.</p>');

  insert into masterclass_modules (title, description, sort_order, published, bereich)
  values ('Das Erstgespräch', 'Schnell anrufen, sicher führen, klar entscheiden.', 3, false, 'fuehrung')
  returning id into m;
  insert into masterclass_lessons (module_id, title, description, typ, status, sort_order, duration_minutes, content_html) values
  (m, 'Anrufen in fünf Minuten', 'Warum Geschwindigkeit über deine Quote entscheidet.', 'video', 'entwurf', 1, 6,
   '<p>Ein Bewerber, der in den ersten Minuten angerufen wird, geht fast immer ran. Nach einem Tag hat er dich vergessen. Deshalb gilt: Neuer Bewerber in der Cloud → sofort anrufen.</p><p>Geht niemand ran, ist der Bewerber für den Tag gesperrt und kommt am nächsten Tag wieder in deine Liste.</p>'),
  (m, 'Der Gesprächsleitfaden', 'Das Erstgespräch Schritt für Schritt – direkt beim ersten Anruf.', 'video', 'entwurf', 2, 15,
   '<p>Das Erstgespräch führst du direkt, wenn jemand rangeht. Ablauf:</p><ol><li>Begrüßung und Rahmen setzen</li><li>Situation und Motivation des Bewerbers verstehen</li><li>Passt das Profil? Klar entscheiden.</li><li>Nächsten Schritt fest vereinbaren – mit Datum und Uhrzeit.</li></ol>'),
  (m, 'Einwände von Bewerbern', 'Was du antwortest, wenn jemand zögert.', 'video', 'entwurf', 3, 12,
   '<p>Die häufigsten Einwände – „keine Zeit“, „ich muss nachdenken“, „ich habe keine Erfahrung“ – und wie du mit Fragen statt Argumenten reagierst.</p>');

  insert into masterclass_modules (title, description, sort_order, published, bereich)
  values ('Vom Ja zum Start', 'Zusage sichern, No-Shows vermeiden, gut einarbeiten.', 4, false, 'fuehrung')
  returning id into m;
  insert into masterclass_lessons (module_id, title, description, typ, status, sort_order, duration_minutes, content_html) values
  (m, 'Zusage sichern und No-Shows vermeiden', 'Was zwischen Zusage und erstem Tag passieren muss.', 'video', 'entwurf', 1, 8,
   '<p>Zwischen Zusage und Start verlierst du die meisten Leute. Halte Kontakt, mach den ersten Tag konkret und bestätige ihn am Vortag.</p>'),
  (m, 'Die ersten 30 Tage', 'Einarbeitung, die neue Vertriebler im Team hält.', 'video', 'entwurf', 2, 12,
   '<p>Feste Ansprechperson, klare Ziele für Woche 1, 2 und 4, tägliche kurze Abstimmung – so wird aus einem neuen Vertriebler ein produktives Teammitglied.</p>');

  insert into masterclass_modules (title, description, sort_order, published, bereich)
  values ('Deine Routine und Zahlen', 'Woran du siehst, ob dein Recruiting läuft – und wie wir dich coachen.', 5, false, 'fuehrung')
  returning id into m;
  insert into masterclass_lessons (module_id, title, description, typ, status, sort_order, duration_minutes, content_html) values
  (m, 'Deine Wochenroutine', 'Feste Zeiten für Anrufe, Gespräche und Einarbeitung.', 'video', 'entwurf', 1, 7,
   '<p>Blocke feste Zeiten: täglich für Erstgespräche, wöchentlich für Einarbeitung und für den Blick auf deine Zahlen.</p>'),
  (m, 'Die Kennzahlen, auf die es ankommt', 'Erreichbarkeit, Termine, Starts – und was sie dir sagen.', 'video', 'entwurf', 2, 8,
   '<p>Bewerber → erreicht → Erstgespräch → Zusage → Start. An jeder Stufe siehst du, wo du nachbessern musst. Diese Zahlen besprechen wir mit dir im Coaching.</p>');
end $$;
