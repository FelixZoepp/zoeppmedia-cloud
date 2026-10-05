/** Inhalte für das Hilfe-Center – je Zielgruppe eigene Themen und Fragen. */

export type Audience = 'kunde' | 'team' | 'admin';
export type TopicIcon = 'start' | 'bewerber' | 'kampagne' | 'konto' | 'aufgaben' | 'kunden' | 'kalender' | 'verwaltung';

export interface HelpTopic {
  key: string;
  label: string;
  icon: TopicIcon;
}

export interface HelpArticle {
  topic: string;
  frage: string;
  antwort: string;
  /** Optionaler Link „Direkt öffnen“ */
  link?: { href: string; label: string };
}

const KUNDE_TOPICS: HelpTopic[] = [
  { key: 'start', label: 'Erste Schritte', icon: 'start' },
  { key: 'bewerber', label: 'Bewerber', icon: 'bewerber' },
  { key: 'kampagne', label: 'Kampagne & Zahlen', icon: 'kampagne' },
  { key: 'konto', label: 'Konto & Einstellungen', icon: 'konto' },
];

const KUNDE: HelpArticle[] = [
  {
    topic: 'start',
    frage: 'Wo sehe ich, was ich als Nächstes tun muss?',
    antwort:
      'Unter „Deine Aufgaben“ stehen alle Schritte, die gerade bei dir liegen – zum Beispiel Zugänge freigeben oder Inhalte hochladen. Sobald du einen Schritt erledigt hast, prüfen wir ihn und melden uns, falls etwas fehlt.',
    link: { href: '/deine-aufgaben', label: 'Deine Aufgaben öffnen' },
  },
  {
    topic: 'start',
    frage: 'Was zeigt mir das Dashboard?',
    antwort:
      'Oben siehst du die wichtigsten Zahlen: alle Bewerber, neue Bewerber dieser Woche, Einstellungen und die Hire Rate. Darunter folgen die Entwicklung pro Monat, die Verteilung nach Quellen und die neuesten Bewerber.',
    link: { href: '/dashboard', label: 'Zum Dashboard' },
  },
  {
    topic: 'start',
    frage: 'Wie installiere ich die Cloud als App?',
    antwort:
      'Am Computer in Chrome oder Edge: unten in der Seitenleiste auf „Installieren“ klicken. Auf dem iPhone: in Safari auf das Teilen-Symbol tippen und „Zum Home-Bildschirm“ wählen. Danach öffnet sich die Cloud wie eine eigene App.',
  },
  {
    topic: 'bewerber',
    frage: 'Wie verschiebe ich einen Bewerber in eine andere Phase?',
    antwort:
      'Öffne „Bewerber“ und zieh die Karte mit der Maus in die passende Spalte, zum Beispiel von „Neu“ zu „Termin vereinbart“. Die Änderung wird sofort gespeichert.',
    link: { href: '/candidates', label: 'Bewerber öffnen' },
  },
  {
    topic: 'bewerber',
    frage: 'Kann ich Bewerber selbst anlegen oder importieren?',
    antwort:
      'Ja. Unter „Bewerber“ legst du einzelne Personen von Hand an oder lädst über „CSV-Import“ eine ganze Liste hoch. Die Vorschau zeigt dir vor dem Import die ersten Zeilen.',
    link: { href: '/candidates', label: 'Bewerber öffnen' },
  },
  {
    topic: 'bewerber',
    frage: 'Wo sehe ich Nachrichten mit Bewerbern?',
    antwort: 'In der „Inbox“ findest du alle WhatsApp-Verläufe mit deinen Bewerbern und kannst direkt antworten.',
    link: { href: '/inbox', label: 'Inbox öffnen' },
  },
  {
    topic: 'kampagne',
    frage: 'Was bedeutet die Hire Rate?',
    antwort: 'Die Hire Rate ist der Anteil der Bewerber, die eingestellt wurden: Einstellungen geteilt durch alle Bewerber.',
  },
  {
    topic: 'kampagne',
    frage: 'Wo finde ich Auswertungen zu meiner Kampagne?',
    antwort:
      'Unter „Statistiken“ siehst du den Recruiting-Trichter und die Entwicklung über die Zeit, unter „Reports“ die regelmäßigen Auswertungen.',
    link: { href: '/statistiken', label: 'Statistiken öffnen' },
  },
  {
    topic: 'kampagne',
    frage: 'Wie bitte ich um eine Änderung an Anzeige oder Funnel?',
    antwort: 'Unter „Projektstatus“ kannst du bei jedem Inhalt „Änderung anfordern“ wählen und kurz beschreiben, was angepasst werden soll.',
    link: { href: '/status', label: 'Projektstatus öffnen' },
  },
  {
    topic: 'konto',
    frage: 'Wie ändere ich unser Logo?',
    antwort: 'Unter „Einstellungen“ auf „Logo ändern“ klicken und ein Bild auswählen (JPG, PNG oder WebP, höchstens 5 MB). Das Logo erscheint danach oben links.',
    link: { href: '/settings', label: 'Einstellungen öffnen' },
  },
  {
    topic: 'konto',
    frage: 'Wie verbinde ich WhatsApp?',
    antwort: 'Unter „Einstellungen → WhatsApp“ führt dich die Einrichtung Schritt für Schritt durch die Verbindung.',
    link: { href: '/settings/whatsapp', label: 'WhatsApp einrichten' },
  },
  {
    topic: 'konto',
    frage: 'Wie schütze ich mein Konto mit Zwei-Faktor-Anmeldung?',
    antwort: 'Unter „Einstellungen“ die Zwei-Faktor-Anmeldung aktivieren und den QR-Code mit einer Authenticator-App scannen.',
    link: { href: '/settings', label: 'Einstellungen öffnen' },
  },
];

const TEAM_TOPICS: HelpTopic[] = [
  { key: 'start', label: 'Erste Schritte', icon: 'start' },
  { key: 'aufgaben', label: 'Aufgaben', icon: 'aufgaben' },
  { key: 'kunden', label: 'Kunden & Ablauf', icon: 'kunden' },
  { key: 'kalender', label: 'Kalender & Team', icon: 'kalender' },
];

const TEAM: HelpArticle[] = [
  {
    topic: 'start',
    frage: 'Wie ändere ich mein Profilbild?',
    antwort: 'Im Profil auf den Kamera-Knopf am Bild klicken. Das Bild wird sofort gespeichert und erscheint in Team, Kalender und oben rechts.',
    link: { href: '/profile', label: 'Profil öffnen' },
  },
  {
    topic: 'start',
    frage: 'Welche Tastenkürzel gibt es?',
    antwort: 'Mit „/“ oder ⌘K springst du in die Suche. Mit „G“ und danach einem Buchstaben wechselst du die Seite, zum Beispiel G dann A für Meine Aufgaben. Alle Kürzel stehen rechts.',
  },
  {
    topic: 'aufgaben',
    frage: 'Wie verschiebe ich eine Aufgabe?',
    antwort:
      'In „Meine Aufgaben“ die Karte in eine andere Spalte ziehen. Auf dem Handy kurz gedrückt halten oder über das Menü (•••) der Karte „Verschieben nach“ wählen.',
    link: { href: '/meine-todos', label: 'Meine Aufgaben öffnen' },
  },
  {
    topic: 'aufgaben',
    frage: 'Was bedeutet „Zu prüfen“?',
    antwort:
      'Der Kunde hat einen Schritt erledigt, oder eine Projektaufgabe wartet auf Freigabe. Prüfe das Ergebnis und schieb die Karte dann auf „Erledigt“.',
  },
  {
    topic: 'aufgaben',
    frage: 'Warum lässt sich eine Ad nicht nach „Zu prüfen“ ziehen?',
    antwort: 'Ads gibt der Kunde selbst frei. Du kannst eine Ad nur in Arbeit nehmen oder nach der Freigabe live schalten („Erledigt“).',
  },
  {
    topic: 'aufgaben',
    frage: 'Wie lege ich eine interne Aufgabe an?',
    antwort: 'In „Meine Aufgaben“ oben auf „Interne Aufgabe“ klicken. Aufgaben mit Fälligkeitsdatum erscheinen automatisch im Kalender.',
    link: { href: '/tasks', label: 'Interne Aufgaben' },
  },
  {
    topic: 'kunden',
    frage: 'Wie lese ich das Kunden-Kanban?',
    antwort:
      'Oben die Pipeline wählen (Zahlung, Onboarding, Setup, Continuity, Offboarding). Jede Karte ist ein Kunde an seinem aktuellen Schritt. Leere Schritte sind schmale Streifen. Mit dem Filter siehst du nur, was bei uns, beim Kunden oder überfällig ist.',
    link: { href: '/clients', label: 'Kunden öffnen' },
  },
  {
    topic: 'kunden',
    frage: 'Wie hake ich einen Kunden-Schritt ab?',
    antwort: 'Auf der Kundenkarte auf „Erledigt“ klicken. Wenn der Kunde dran war, heißt der Knopf „Kunde hat erledigt“, bei Prüfungen „Passt – erledigt“. Ist die Phase komplett, rückt der Kunde automatisch weiter.',
  },
  {
    topic: 'kalender',
    frage: 'Was zeigt der Kalender?',
    antwort:
      'Calendly-Termine und alle offenen Fristen des Teams: Fulfillment-Schritte, Ads, Projekt- und interne Aufgaben. Mit dem Filter oben siehst du nur die Einträge einer Person. Termine bleiben dabei immer sichtbar.',
    link: { href: '/kalender', label: 'Kalender öffnen' },
  },
  {
    topic: 'kalender',
    frage: 'Wie wird die Auslastung im Team berechnet?',
    antwort:
      'Gezählt werden alle offenen Aufgaben einer Person aus allen Quellen. Überfällige zählen doppelt. 20 Punkte entsprechen 100 %. Ab 85 % wird der Balken orange.',
    link: { href: '/team', label: 'Team öffnen' },
  },
];

const ADMIN_TOPICS: HelpTopic[] = [...TEAM_TOPICS, { key: 'verwaltung', label: 'Verwaltung', icon: 'verwaltung' }];

const ADMIN_EXTRA: HelpArticle[] = [
  {
    topic: 'verwaltung',
    frage: 'Wie lade ich einen Mitarbeiter ein?',
    antwort: 'Unter „Team“ auf „Mitarbeiter einladen“ klicken, Name und E-Mail eintragen und optional die Zuständigkeit wählen. Die Person bekommt einen Link zur Registrierung.',
    link: { href: '/team', label: 'Team öffnen' },
  },
  {
    topic: 'verwaltung',
    frage: 'Wie lege ich einen neuen Kunden an?',
    antwort: 'Über „Einladungen“ eine Einladung für die Agentur erstellen. Nach der Registrierung erscheint der Kunde im Kanban in der Zahlungs-Pipeline.',
    link: { href: '/invites', label: 'Einladungen öffnen' },
  },
  {
    topic: 'verwaltung',
    frage: 'Wie setze ich das Logo eines Kunden?',
    antwort: 'Auf der Kundenseite unter dem Kopf auf „Kunden-Logo ändern“ klicken. Kunden können ihr Logo auch selbst in ihren Einstellungen hochladen.',
    link: { href: '/clients', label: 'Kunden öffnen' },
  },
  {
    topic: 'verwaltung',
    frage: 'Wo stelle ich die KPI-Ziele ein?',
    antwort: 'Unter „KPI Einstellungen“ legst du die Zielwerte fest, an denen Kunden-Kennzahlen gemessen werden.',
    link: { href: '/admin/kpi', label: 'KPI Einstellungen' },
  },
];

export function helpFor(audience: Audience): { topics: HelpTopic[]; articles: HelpArticle[] } {
  if (audience === 'kunde') return { topics: KUNDE_TOPICS, articles: KUNDE };
  if (audience === 'admin') {
    return { topics: ADMIN_TOPICS, articles: [...TEAM, ...ADMIN_EXTRA] };
  }
  return { topics: TEAM_TOPICS, articles: TEAM };
}

/** Tastenkürzel – werden in der LayoutShell tatsächlich umgesetzt */
export interface Shortcut {
  keys: string[];
  label: string;
  /** Ziel für „G + Taste“ */
  href?: string;
}

export function shortcutsFor(audience: Audience): Shortcut[] {
  const base: Shortcut[] =
    audience === 'kunde'
      ? [
          { keys: ['G', 'D'], label: 'Zum Dashboard', href: '/dashboard' },
          { keys: ['G', 'B'], label: 'Zu den Bewerbern', href: '/candidates' },
          { keys: ['G', 'I'], label: 'Zur Inbox', href: '/inbox' },
          { keys: ['G', 'A'], label: 'Zu deinen Aufgaben', href: '/deine-aufgaben' },
        ]
      : [
          { keys: ['⌘', 'K'], label: 'Suche' },
          { keys: ['/'], label: 'Suche von überall' },
          { keys: ['G', 'A'], label: 'Zu Meine Aufgaben', href: '/meine-todos' },
          { keys: ['G', 'K'], label: 'Zu den Kunden', href: '/clients' },
          { keys: ['G', 'C'], label: 'Zum Kalender', href: '/kalender' },
          { keys: ['G', 'T'], label: 'Zum Team', href: '/team' },
          ...(audience === 'admin' ? [{ keys: ['G', 'D'], label: 'Zur Overview', href: '/admin' }] : []),
        ];
  return [...base, { keys: ['G', 'H'], label: 'Zum Hilfe-Center', href: '/hilfe' }, { keys: ['Esc'], label: 'Menüs und Dialoge schließen' }];
}

export function audienceFor(role: string): Audience {
  if (role === 'admin') return 'admin';
  if (role === 'employee') return 'team';
  return 'kunde';
}
