/**
 * Das Zoepp System – Zahlung & Mahnwesen (Checkliste "Zahlung & Mahnwesen").
 * Texte 1:1 aus der Checkliste. NIEMALS eigenständig verändern.
 * Platzhalter: {VORNAME}, {RECHNUNGSNUMMER}, {NAME} (wer anruft), {TELEFON}, {KUNDENNAME},
 * {DATUM_ABSCHLUSS}, {SUMME}.
 */

export interface MahnSchritt {
  schritt: number;
  titel: string;
  /** Tage ab Rechnungsdatum (basis 'rechnung') oder ab Zahlungsziel (basis 'ziel') */
  basis: 'rechnung' | 'ziel';
  tage: number;
  /** Kuschel-Call nur bei der Einrichtungsgebühr */
  nurSetup?: boolean;
  telefon?: string;
  mail?: { betreff: string; text: string; an?: string };
  whatsapp?: string;
}

export const MAHN_SCHRITTE: MahnSchritt[] = [
  {
    schritt: 1,
    titel: 'Rechnung schreiben',
    basis: 'rechnung',
    tage: 0,
    mail: {
      betreff: 'Deine Rechnung & Auftragsbestätigung',
      text: `Hallo {VORNAME},

anbei sende ich dir die Rechnung für deine Unterlagen zu.
Das gesamte Zoepp Media Team sagt Danke für uns das entgegenbrachte Vertrauen und freut sich auf eine erfolgreiche Zusammenarbeit.

Solltest du Fragen zu deiner Rechnung haben, sind wir jederzeit dein Ansprechpartner.

WICHTIG:
Bitte gib bei Deiner Zahlungsanweisung die Rechnungs- und Kundennummer als Verwendungszweck an, da uns das die Zuordnung erheblich erleichtert und Die Zahlungsabwicklung über einen externen Anbieter abgewickelt wird.

Dein Zoepp Media Team`,
    },
  },
  {
    schritt: 2,
    titel: 'Kuschel-Call',
    basis: 'rechnung',
    tage: 1,
    nurSetup: true,
    telefon: `Lieber Kunde,

hier ist {NAME} aus dem Team von Zoepp Media. Du hast Dich ja Gestern dafür entschieden uns das Vertrauen im Bereich des Recruitings zu schenken. Aus diesen Grund führen wir immer einen kurzen Serviceanruf durch um zu schauen, ob alles bei Dir geklappt hat. Hast Du noch irgendwelche offenen Fragen, oder wurde alles soweit geklärt?

Kunde redet..

Perfekt, dann habe ich noch eine kleine Bitte:
Wir arbeiten mit einem externen Zahlungsabwickler zusammen und damit hier alles reibungslos für Dich verläuft, wollte ich nur kurz nachfragen, bis wann die Zahlung eingeht, damit ich das im System hinterlegen kann.

Perfekt super.. Danke wünsche ich Dir noch einen erfolgreichen Tag und freue mich auf eine tolle Zusammenarbeit.`,
    mail: {
      betreff: 'Unser Service-Team',
      text: `Lieber Kunde,

hier ist {NAME} aus dem Team von Zoepp Media. Du hast Dich ja Gestern dafür entschieden uns das Vertrauen im Bereich des Recruitings zu schenken. Aus diesen Grund wollten wir Dich für einen kurzen Serviceanruf erreichen. Leider warst Du nicht erreichbar. Solltest Du Fragen haben, kannst Du uns gerne jederzeit erreichen.

Wichtiger Hinweis:
Wir arbeiten mit einem externen Zahlungsabwickler zusammen und damit hier alles reibungslos für Dich verläuft, wollte ich nur kurz nachfragen, bis wann die Zahlung eingeht, damit ich das im System hinterlegen kann.

Sehr gerne kannst Du mir eine kurze Mail schreiben, oder einfach zurück rufen.
Das gesamte Zoepp Media TEAM freut sich auf eine erfolgreiche Zusammenarbeit und wünscht Dir einen genialen Tag.`,
    },
    whatsapp: `Lieber Kunde,
hier ist {NAME} aus dem Team von Zoepp Media. Ich wollte Dich kurz für einen Serviceanruf erreichen, doch leider hat das nicht geklappt. Bitte melde Dich doch kurz unter der folgenden Telefonnummer: {TELEFON}

Wir freuen uns auf eine geniale Zusammenarbeit.
DEIN Zoepp Media TEAM`,
  },
  {
    schritt: 3,
    titel: 'Erinnerung-Call',
    basis: 'ziel',
    tage: 5,
    telefon: `Lieber Kunde,
hier ist {NAME} aus dem Team von Zoepp Media. Ich hoffe bei Dir ist alles soweit gut?
Ich habe gerade nur von unserem externen Partner eine Mahnung bekommen, dass die Zahlung 5 Tage in Verzug ist. Dss ist auch grundsätzlich kein Problem. Ich wollte mich jetzt einfach nur kurz bei Dir melden um nachzufragen, bis wann die Rechnung beglichen wird, nicht das hier irgendwelche Mahngebühren entstehen...

Kunde redet..

Perfekt super.. Danke wünsche ich Dir noch einen erfolgreichen Tag und ich gebe das genau so an unseren externen Partner weiter.`,
    mail: {
      betreff: 'Bei Dir ist etwas untergegangen..',
      text: `Hallo {VORNAME},

ich wollte mich nur kurz bei Dir melden, da wir von unserem externen Zahlungsanbieter eine Mahnung bekommen haben, dass Deine Zahlung 5 Tage in Verzug ist..

Wahrscheinlich ist in dem Alltagsstress die Rechnung mit der Rechnungsnummer {RECHNUNGSNUMMER} bei Dir untergegangen. Das ist nicht schlimm und kann schonmal passieren.

Damit keine weiteren Gebühren entstehen, möchte ich Dich hiermit an den Ausgleich der Rechnung erinnern.

Solltest Du Fragen haben, stehen wir Dir natürlich jederzeit zur Verfügung.`,
    },
    whatsapp: `Hallo {VORNAME},

ich wollte mich nur kurz bei Dir melden, da wir von unserem externen Zahlungsanbieter eine Mahnung bekommen haben, dass Deine Zahlung 5 Tage in Verzug ist..

Damit keine weiteren Gebühren entstehen, möchte ich Dich hiermit an den Ausgleich der Rechnung erinnern.

Am besten telefonieren wir kurz, damit wir alles Weitere durchsprechen können.
DEIN Zoepp Media TEAM`,
  },
  {
    schritt: 4,
    titel: 'Mahnung 1 Call',
    basis: 'ziel',
    tage: 10,
    telefon: `Lieber Kunde,

hier ist {NAME} aus dem Team von Zoepp Media. Ich habe hier leider schon die erste Mahnung vor mir auf den Tisch liegen und wollte nachfragen ob alles ok ist?

Die Zahlung ist nun leider schon 10 Tage in Verzug. Bis wann können wir denn nun mit dem Eingang rechnen? Denn das Problem ist, wenn jetzt nochmal eine Mahnung kommt, dann entstehen zusätzliche Mahngebühren und das möchte ich unbedingt vermeiden...

Kunde redet..

Perfekt super.. Danke wünsche ich Dir noch einen erfolgreichen Tag und ich gebe das genau so an unseren externen Partner weiter.`,
    mail: {
      betreff: 'Mahnung 1',
      text: `Hallo {VORNAME},

sicherlich hast Du unsere Rechnung in Deinem Postfach übersehen. Leider hat uns der externe Partner eine erste Mahnung zu kommen lassen.

Daher bitten wir Dich höflichst, die ausstehenden Forderungen schnellstmöglich zu begleichen. Solltest Du Fragen oder Hilfe benötigen, dann zögere bitte nicht, dich bei uns zu melden.

Leider müssen wir Dich darauf hinweisen, dass die 2te Mahnung nach weiteren 5 Tagen automatisiert versendet wird und unser externer Zahlungsanbieter dann eine Mahngebühr von 5,50 € erheben wird.

Damit das vermieden wird, kannst Du Dich jederzeit bei uns melden, oder einfach schnellstmöglich die Rechnung begleichen.`,
    },
    whatsapp: `Hallo {VORNAME},

sicherlich hast Du unsere Rechnung in Deinem Postfach übersehen. Leider hat uns der externe Partner eine erste Mahnung zu kommen lassen.

Leider müssen wir Dich darauf hinweisen, dass die 2te Mahnung nach weiteren 5 Tagen automatisiert versendet wird und unser externer Zahlungsanbieter dann eine Mahngebühr von 5,50 € erheben wird.

Damit das vermieden wird, kannst Du Dich jederzeit bei uns melden, oder einfach schnellstmöglich die Rechnung begleichen.`,
  },
  {
    schritt: 5,
    titel: 'Mahnung 2 Call',
    basis: 'ziel',
    tage: 15,
    telefon: `Lieber Kunde,

hier ist {NAME} aus dem Team von Zoepp Media. Ich habe hier leider schon die zweite Mahnung vor mir auf den Tisch liegen und wollte nachfragen ob alles ok ist?

Die Zahlung ist nun leider schon 15 Tage in Verzug. Bis wann können wir denn nun mit dem Eingang rechnen? Denn das Problem ist, wenn jetzt nochmal eine Mahnung kommt, dann kann es beinächsten Mal im Inkasso landen..

Kunde redet..

Perfekt super.. Danke wünsche ich Dir noch einen erfolgreichen Tag und ich gebe das genau so an unseren externen Partner weiter.`,
    mail: {
      betreff: 'Mahnung 2',
      text: `Hallo {VORNAME},

leider ist die Zahlung noch immer nicht bei uns eingegangen. Hiermit sende ich Dir die 2te Mahnung mit der angekündigten Mahngebühr.

Ich bitte Dich um sofortigen Ausgleich, da unser externe Partner bei der nächsten Mahnung die Rechnung in das zuständige Inkassobüro weiterleiten wird.

BIte melde Dich doch kurz bei uns, damit wir alles noch rechtzeitig klären können.`,
    },
    whatsapp: `Hallo {VORNAME},

leider ist die Zahlung noch immer nicht bei uns eingegangen.

Ich bitte Dich um sofortigen Ausgleich, da unser externe Partner bei der nächsten Mahnung die Rechnung in das zuständige Inkassobüro weiterleiten wird.

BIte melde Dich doch kurz bei uns, damit wir alles noch rechtzeitig klären können.`,
  },
  {
    schritt: 6,
    titel: 'Mahnung 3 Call',
    basis: 'ziel',
    tage: 20,
    telefon: `Lieber Kunde,

hier ist {NAME} aus dem Team von Zoepp Media. Leider ist die Zahlung noch immer nicht bei uns eingegangen und so langsam sind auch unsere Hände gebunden..

Ich bitte Dich nun um sofortigen Ausgleich, da ansonsten unser externer Zahlungsanbieter die Rechnung an das zuständiges Inkassobüro weiterleiten wird.
Kunde redet..

Perfekt super.. Danke wünsche ich Dir noch einen erfolgreichen Tag und ich gebe das genau so an unseren externen Partner weiter.`,
    mail: {
      betreff: 'Letzte Mahnung..',
      text: `Hallo {VORNAME},

leider ist die Zahlung noch immer nicht bei uns eingegangen und so langsam sind auch unsere Hände gebunden..

Hiermit müssen wir Dir leider die 3te Mahnung und somit letzte Mahnung senden.

Ich bitte Dich nun um sofortigen Ausgleich, da ansonsten unser externer Zahlungsanbieter die Rechnung an das zuständiges Inkassobüro weiterleiten wird.

Wenn Du Fragen hast, bitte melde Dich ganz schnell bei uns...`,
    },
    whatsapp: `Hallo {VORNAME},

leider ist die Zahlung noch immer nicht bei uns eingegangen und so langsam sind auch unsere Hände gebunden..

Ich bitte Dich nun um sofortigen Ausgleich, da ansonsten unser externer Zahlungsanbieter die Rechnung an das zuständiges Inkassobüro weiterleiten wird.

Wenn Du Fragen hast, bitte melde Dich ganz schnell bei uns...`,
  },
  {
    schritt: 7,
    titel: 'Anwalt abgeben',
    basis: 'ziel',
    tage: 30,
    mail: {
      an: 'rechtsanwaelte@cherek.org',
      betreff: 'Forderungsanfrage Fall {KUNDENNAME}',
      text: `Sehr geehrte Damen und Herren,

wir würden gerne den Fall {KUNDENNAME} an Sie abgeben. Der {KUNDENNAME} hat mit uns am {DATUM_ABSCHLUSS} geschlossen über eine Gesamtsumme von {SUMME}. Die Rechnung ist nun 30 Tage überfällig und wir würden gerne mit der Zusammenarbeit starten. Wir wollen von unserem Zurückhaltungsrecht Gebrauch machen bis der Kunde gezahlt hat, dann würden wir gerne die Zusammenarbeit wie geplant starten. Einen Zahlungseingang würden wir uns innerhalb der nächsten 14 Tage spätestens wünschen. Der Vertrag wurde geschlossen durch [Vertragsunterlagen]. Diese packe Ich Ihnen in den Anhang.

MfG {NAME} aus dem Team von Zoepp Media`,
    },
  },
];

export function fill(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(/\{([A-Z_]+)\}/g, (m, k) => vars[k] ?? m);
}
