/**
 * „Startklar“-Checkliste: Was muss ein Kunde einmal erledigen, bevor er in der Cloud arbeitet?
 * Reine Auswertung (testbar) – die Rohdaten liefert `ladeStartklar` (./laden.ts).
 */

export type StartklarKey = 'onboarding' | 'team' | 'whatsapp' | 'absendernummer' | 'masterclass' | 'anruf';

export interface StartklarRohdaten {
  onboardingAbgeschlossen: boolean;
  /** Kunden-Logins der Agentur (Inhaber, Mitarbeiter, Nur lesen) */
  nutzer: number;
  /** Einladungen an Kollegen (Mitarbeiter/Nur lesen, egal ob schon angenommen) */
  teamEinladungen: number;
  whatsappVerbunden: boolean;
  outboundPhone: string | null;
  masterclassGestartet: boolean;
  anrufe: number;
}

export interface StartklarSchritt {
  key: StartklarKey;
  titel: string;
  erklaerung: string;
  /** Link im Kundenportal; null = erledigen wir (kein Link) */
  href: string | null;
  erledigt: boolean;
}

export interface Startklar {
  schritte: StartklarSchritt[];
  erledigt: number;
  gesamt: number;
  prozent: number;
  fertig: boolean;
}

/** Absendernummer für Anrufe muss deutsch sein (sonst werden keine Anrufe aufgebaut) */
export const istDeutscheNummer = (n: string | null | undefined) => !!n && /^\+49\d{6,}$/.test(n.replace(/[\s/-]/g, ''));

export function werteStartklarAus(d: StartklarRohdaten): Startklar {
  const schritte: StartklarSchritt[] = [
    { key: 'onboarding', titel: 'Onboarding ausgefüllt', erklaerung: 'Ein Formular mit allem, was wir für deine Kampagne brauchen.', href: '/onboarding', erledigt: d.onboardingAbgeschlossen },
    { key: 'team', titel: 'Team eingeladen', erklaerung: 'Lade die Kollegen ein, die Bewerber anrufen und Termine machen.', href: '/settings/team', erledigt: d.nutzer > 1 || d.teamEinladungen > 0 },
    { key: 'whatsapp', titel: 'WhatsApp verbunden', erklaerung: 'Verbinde deine Nummer – die Anleitung führt dich Schritt für Schritt.', href: '/settings/whatsapp', erledigt: d.whatsappVerbunden },
    { key: 'absendernummer', titel: 'Absendernummer für Anrufe', erklaerung: 'Richten wir für dich ein – melde dich, falls sie fehlt.', href: null, erledigt: istDeutscheNummer(d.outboundPhone) },
    { key: 'masterclass', titel: 'Masterclass gestartet', erklaerung: 'Das erste Video zeigt dir, wie Recruiting mit der Cloud läuft.', href: '/masterclass', erledigt: d.masterclassGestartet },
    { key: 'anruf', titel: 'Ersten Bewerber angerufen', erklaerung: 'Im Anruf-Modus rufst du Bewerber nacheinander an und trägst das Ergebnis ein.', href: '/anrufen', erledigt: d.anrufe > 0 },
  ];
  const erledigt = schritte.filter((s) => s.erledigt).length;
  return { schritte, erledigt, gesamt: schritte.length, prozent: Math.round((erledigt / schritte.length) * 100), fertig: erledigt === schritte.length };
}
