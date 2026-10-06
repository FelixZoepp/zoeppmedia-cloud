/**
 * Empfehlungen für Kunden („Upsell-Booster“): aus den echten Zahlen der Kunden-Cloud abgeleitet.
 * Zwei Arten:
 *  - tipp:    kostenlos, macht den Kunden effizienter (bessere Ergebnisse = zufriedener Kunde)
 *  - leistung: Zusatzleistung/Paket von Zoepp Media – Interesse geht an den Ansprechpartner
 * Rein (keine I/O) – genutzt von der Empfehlungen-Seite, dem KI-Assistenten und den Kundenberatern.
 * Keine Preise: die klärt der Ansprechpartner.
 */

export type EmpfehlungArt = 'tipp' | 'leistung';

export interface Empfehlung {
  id: string;
  art: EmpfehlungArt;
  titel: string;
  /** Warum gerade jetzt – mit den Zahlen des Kunden */
  warum: string;
  /** Was es bringt */
  nutzen: string;
  /** Tipp: Weg in der Cloud */
  link?: { label: string; href: string };
  /** 1 = am wichtigsten */
  prio: number;
}

export interface KundenLage {
  paket: string | null;
  phase: string | null;
  bewerber30: number;
  bewerberVorher: number;
  bewerber7: number;
  /** Bewerber in der Eingangsstufe, noch nicht bearbeitet */
  offen: number;
  ohneKontakt: number;
  kontaktquote: number | null;
  speedToLeadMin: number | null;
  anrufe30: number;
  erreichbarkeit: number | null;
  termine30: number;
  noShows30: number;
  einstellungen30: number;
  whatsappVerbunden: boolean;
  karriereseite: boolean;
  masterclassFortschritt: number | null;
  /** 12 Persona-Typen freigeschaltet (agencies.settings.persona.aktiv) */
  personaFreigeschaltet: boolean;
  /** Persona-Tests in den letzten 30 Tagen verschickt */
  personaTests30: number;
}

/** Leistungen, die empfohlen werden dürfen (an einer Stelle pflegbar) */
export const LEISTUNGEN = {
  growth: 'Paket „Growth“ – Masterclass, Content-Paket (3 Reels/Monat) und monatlicher Tracking-Call',
  scale: 'Paket „Scale“ – 6 Reels/Monat, Employer Branding, Karriereseite und Tracking-Call alle zwei Wochen',
  imagefilm: 'Imagefilm / Social-Media-Paket für eure Arbeitgebermarke',
  karriereseite: 'Eigene Karriere-Website',
  workshop: 'Recruiting-Workshop für dein Team (Gesprächsführung, Termin- und No-Show-Quote)',
  prozess: 'CRM- und Prozessberatung',
  budget: 'Mehr Werbebudget bzw. zusätzliche Kanäle (Meta + Indeed)',
  persona: '12 Persona-Typen – Persönlichkeitstest für Vertriebsbewerber: 48 Fragen in 5 Minuten, 12 Vertriebstypen, Warnsignale und Interviewleitfaden',
} as const;

export function berechneEmpfehlungen(l: KundenLage): Empfehlung[] {
  const e: Empfehlung[] = [];
  const paket = (l.paket ?? '').toLowerCase();
  const kampagneLaeuft = l.phase === 'continuity';

  /* ── Effizienz-Tipps (kostenlos) ───────────────────────────── */
  if (l.ohneKontakt > 0) {
    e.push({
      id: 'tipp_anrufen',
      art: 'tipp',
      titel: `${l.ohneKontakt} Bewerber warten auf deinen Anruf`,
      warum: `${l.ohneKontakt} Bewerber wurden noch nicht kontaktiert.`,
      nutzen: 'Wer in den ersten Minuten anruft, erreicht deutlich mehr Bewerber – jede Stunde Warten kostet Termine.',
      link: { label: 'Anruf-Modus öffnen', href: '/anrufen' },
      prio: 1,
    });
  }
  if (l.speedToLeadMin !== null && l.speedToLeadMin > 60) {
    e.push({
      id: 'tipp_speed',
      art: 'tipp',
      titel: 'Schneller anrufen',
      warum: `Im Schnitt vergehen ${l.speedToLeadMin < 120 ? `${l.speedToLeadMin} Minuten` : `${Math.round(l.speedToLeadMin / 60)} Stunden`} bis zum ersten Kontakt.`,
      nutzen: 'Ziel sind unter 15 Minuten. Push-Benachrichtigungen aufs Handy helfen, neue Bewerber sofort zu sehen.',
      link: { label: 'Anruf-Modus öffnen', href: '/anrufen' },
      prio: 2,
    });
  }
  if (!l.whatsappVerbunden) {
    e.push({
      id: 'tipp_whatsapp',
      art: 'tipp',
      titel: 'WhatsApp verbinden',
      warum: 'Deine WhatsApp-Nummer ist noch nicht mit der Cloud verbunden.',
      nutzen: 'Bewerber antworten auf WhatsApp viel häufiger als auf Anrufe – inklusive automatischer Vorqualifizierung und Terminerinnerungen.',
      link: { label: 'WhatsApp verbinden', href: '/settings/whatsapp' },
      prio: 2,
    });
  }
  if (l.termine30 >= 3 && l.noShows30 / l.termine30 > 0.25) {
    e.push({
      id: 'tipp_noshow',
      art: 'tipp',
      titel: 'No-Shows senken',
      warum: `${l.noShows30} von ${l.termine30} Terminen in 30 Tagen waren No-Shows.`,
      nutzen: 'Termine am Vortag per WhatsApp bestätigen lassen und den Termin nicht weiter als 2 Tage in die Zukunft legen.',
      link: { label: 'Kalender öffnen', href: '/termine' },
      prio: 3,
    });
  }
  if (l.masterclassFortschritt !== null && l.masterclassFortschritt < 50) {
    e.push({
      id: 'tipp_masterclass',
      art: 'tipp',
      titel: 'Masterclass weitermachen',
      warum: `Du hast ${l.masterclassFortschritt} % der Masterclass gesehen.`,
      nutzen: 'Die Lektionen zu Erstgespräch und Einarbeitung erhöhen direkt deine Einstellungsquote.',
      link: { label: 'Zur Masterclass', href: '/masterclass' },
      prio: 4,
    });
  }

  if (l.personaFreigeschaltet && l.personaTests30 < 3 && l.bewerber30 >= 5) {
    e.push({
      id: 'tipp_persona',
      art: 'tipp',
      titel: 'Persona-Test nutzen',
      warum: `Der Persona-Test ist freigeschaltet, wurde in 30 Tagen aber ${l.personaTests30 === 0 ? 'noch nicht' : `nur ${l.personaTests30}×`} verschickt.`,
      nutzen: 'Schick ihn vor dem Vorstellungsgespräch – du siehst Vertriebstyp und Warnsignale und führst das Gespräch gezielter.',
      link: { label: 'Zu den Bewerbern', href: '/candidates' },
      prio: 3,
    });
  }

  /* ── Leistungen (Upsell) ───────────────────────────────────── */
  if (kampagneLaeuft && (l.bewerber7 === 0 || (l.bewerberVorher >= 5 && l.bewerber30 < l.bewerberVorher * 0.6))) {
    e.push({
      id: 'leistung_budget',
      art: 'leistung',
      titel: 'Mehr Bewerber durch mehr Reichweite',
      warum: l.bewerber7 === 0 ? 'In den letzten 7 Tagen kamen keine neuen Bewerber.' : `Diesen Monat ${l.bewerber30} Bewerber statt ${l.bewerberVorher} im Vormonat.`,
      nutzen: LEISTUNGEN.budget,
      prio: 1,
    });
  }
  if (l.offen >= 25 || (l.bewerber30 >= 30 && (l.kontaktquote ?? 100) < 70)) {
    e.push({
      id: 'leistung_prozess',
      art: 'leistung',
      titel: 'Mehr Bewerber in Einstellungen verwandeln',
      warum: `${l.offen} Bewerber stehen noch im Eingang${l.kontaktquote !== null ? `, kontaktiert wurden ${l.kontaktquote} %` : ''}.`,
      nutzen: `${LEISTUNGEN.prozess} – damit jeder Bewerber sauber und schnell bearbeitet wird.`,
      prio: 1,
    });
  }
  if (l.termine30 >= 3 && (l.noShows30 / l.termine30 > 0.3 || (l.einstellungen30 === 0 && l.termine30 >= 6))) {
    e.push({
      id: 'leistung_workshop',
      art: 'leistung',
      titel: 'Mehr Einstellungen aus deinen Terminen',
      warum: l.einstellungen30 === 0 ? `${l.termine30} Termine, aber noch keine Einstellung in 30 Tagen.` : `Hohe No-Show-Quote (${l.noShows30} von ${l.termine30}).`,
      nutzen: LEISTUNGEN.workshop,
      prio: 2,
    });
  }
  if (l.einstellungen30 >= 2) {
    e.push({
      id: 'leistung_imagefilm',
      art: 'leistung',
      titel: 'Arbeitgebermarke stärken',
      warum: `${l.einstellungen30} Einstellungen in 30 Tagen – das Team wächst.`,
      nutzen: `${LEISTUNGEN.imagefilm}: Bewerber sehen echte Einblicke, die Bewerbungsqualität steigt.`,
      prio: 3,
    });
  }
  if (!l.karriereseite && !paket.includes('scale')) {
    e.push({
      id: 'leistung_karriereseite',
      art: 'leistung',
      titel: 'Eigene Karriereseite',
      warum: 'Für dein Unternehmen gibt es noch keine Karriereseite.',
      nutzen: `${LEISTUNGEN.karriereseite}: mehr Vertrauen bei Bewerbern und günstigere Anzeigen.`,
      prio: 4,
    });
  }
  if (!l.personaFreigeschaltet && l.bewerber30 >= 10) {
    e.push({
      id: 'leistung_persona',
      art: 'leistung',
      titel: 'Bewerber vorab per Persona-Test einschätzen',
      warum: `${l.bewerber30} Bewerber und ${l.termine30} Termine in 30 Tagen – jede Fehlbesetzung kostet Zeit.`,
      nutzen: `${LEISTUNGEN.persona}: weniger Fehlbesetzungen und No-Shows, der Test geht mit einem Klick aus der Cloud raus.`,
      prio: 2,
    });
  }
  if (paket.includes('starter') && l.bewerber30 >= 10) {
    e.push({ id: 'leistung_growth', art: 'leistung', titel: 'Nächste Stufe: Growth', warum: `Mit ${l.bewerber30} Bewerbern im Monat ist die Basis da.`, nutzen: LEISTUNGEN.growth, prio: 3 });
  } else if (paket.includes('growth') && l.einstellungen30 >= 3) {
    e.push({ id: 'leistung_scale', art: 'leistung', titel: 'Nächste Stufe: Scale', warum: `${l.einstellungen30} Einstellungen in 30 Tagen – Zeit zu skalieren.`, nutzen: LEISTUNGEN.scale, prio: 3 });
  }

  return e.sort((a, b) => a.prio - b.prio || (a.art === 'tipp' ? -1 : 1));
}
