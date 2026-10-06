/**
 * Freischaltbare Leistungen („gesperrte Funktionen“) für die Kunden-Cloud: Inhalte für die
 * großen Upsell-Karten mit allen Vorteilen und einem Kundenbeispiel. Rein (keine I/O).
 *
 * Kundenbeispiele: nur echte, freigegebene Referenzen verwenden (dieselben wie in der
 * Sales-Kommunikation). Hier pflegen, wenn es neue Cases gibt.
 */

import type { Empfehlung, KundenLage } from './regeln';

export interface Kundenbeispiel {
  kunde: string;
  branche: string;
  /** Große Kennzahl, z. B. „2 → 15“ */
  kennzahl: string;
  kennzahlText: string;
  text: string;
}

export interface Leistung {
  id: string;
  titel: string;
  untertitel: string;
  icon: 'persona' | 'reichweite' | 'prozess' | 'workshop' | 'film' | 'seite' | 'paket';
  vorteile: string[];
  beispiel: Kundenbeispiel;
}

const BC: Kundenbeispiel = {
  kunde: 'B&C Direct Sales',
  branche: 'PV-Direktvertrieb',
  kennzahl: '2 → 15',
  kennzahlText: 'Vertriebler in 3 Monaten',
  text: 'Mit sauberem Recruiting-Prozess von 2 auf 15 Leute gewachsen – heute mit 6-stelligen Monatsumsätzen.',
};
const CGMS: Kundenbeispiel = {
  kunde: 'CGMS GmbH',
  branche: 'Glasfaser-Vertrieb, Köln',
  kennzahl: '4 → 12',
  kennzahlText: 'Vertriebler in unter 3 Monaten',
  text: 'Das Team in unter drei Monaten verdreifacht – mit planbarem Bewerberfluss statt Zufall.',
};
const MAXPROM: Kundenbeispiel = {
  kunde: 'Maxprom',
  branche: 'Direktvertrieb',
  kennzahl: '1 Mio. €',
  kennzahlText: 'Umsatz im besten Monat',
  text: '10 bis 20 neue Partner pro Monat – und im besten Monat 1 Mio. € Umsatz.',
};

export const LEISTUNGEN_KATALOG: Leistung[] = [
  {
    id: 'leistung_persona',
    titel: '12 Persona-Typen Test',
    untertitel: 'Erkenne vor dem Gespräch, wer wirklich verkaufen kann.',
    icon: 'persona',
    vorteile: [
      '48 Fragen in 5 Minuten – Bewerber machen den Test direkt per Link',
      'Einordnung in 12 Vertriebstypen, z. B. Jäger, Diplomat, Stratege',
      'Automatische Warnsignale bei 5 kritischen Verhaltensmustern',
      'Passung zur Rolle: Opener, Closer, D2D oder Teamleitung',
      'Interviewleitfaden für jedes Gespräch – Ergebnis landet direkt in der Bewerberakte',
      'Weniger Fehlbesetzungen und No-Shows, mehr Zeit für die richtigen Bewerber',
    ],
    beispiel: MAXPROM,
  },
  {
    id: 'leistung_budget',
    titel: 'Mehr Reichweite',
    untertitel: 'Mehr Bewerber durch mehr Budget und zusätzliche Kanäle.',
    icon: 'reichweite',
    vorteile: [
      'Mehr Werbebudget gezielt in die Anzeigen, die schon performen',
      'Zusätzliche Kanäle: Meta und Indeed parallel',
      'Neue Anzeigen-Varianten und Zielgruppen-Tests',
      'Laufende Optimierung der Kosten pro Bewerber',
      'Planbarer Bewerberfluss statt Schwankungen',
    ],
    beispiel: MAXPROM,
  },
  {
    id: 'leistung_prozess',
    titel: 'CRM- und Prozessberatung',
    untertitel: 'Aus mehr Bewerbern mehr Einstellungen machen.',
    icon: 'prozess',
    vorteile: [
      'Klarer Ablauf vom Eingang bis zur Einstellung',
      'Speed-to-Lead: jeder Bewerber in Minuten statt Stunden kontaktiert',
      'Saubere Pipeline – kein Bewerber geht mehr verloren',
      'Feste Zuständigkeiten und Nachfass-Rhythmus im Team',
      'Kennzahlen, mit denen du dein Recruiting steuerst',
    ],
    beispiel: BC,
  },
  {
    id: 'leistung_workshop',
    titel: 'Recruiting-Workshop',
    untertitel: 'Mehr Einstellungen aus deinen Terminen.',
    icon: 'workshop',
    vorteile: [
      'Gesprächsleitfaden für Erst- und Vorstellungsgespräch',
      'Weniger No-Shows durch richtige Terminierung und Bestätigung',
      'Einwandbehandlung und Abschluss im Bewerbergespräch',
      'Onboarding, damit Neue bleiben und schnell Umsatz machen',
      'Praxisnah mit deinem Team, auf euren Vertrieb zugeschnitten',
    ],
    beispiel: CGMS,
  },
  {
    id: 'leistung_imagefilm',
    titel: 'Imagefilm & Social Media',
    untertitel: 'Eine Arbeitgebermarke, auf die sich die Richtigen bewerben.',
    icon: 'film',
    vorteile: [
      'Professioneller Imagefilm mit echten Einblicken ins Team',
      'Social-Media-Content für Instagram, TikTok und Facebook',
      'Höhere Bewerbungsqualität – Bewerber wissen, worauf sie sich einlassen',
      'Günstigere Anzeigen durch besseren Content',
      'Vertrauen bei Bewerbern und Kunden gleichermaßen',
    ],
    beispiel: BC,
  },
  {
    id: 'leistung_karriereseite',
    titel: 'Eigene Karriere-Website',
    untertitel: 'Dein Zuhause für Bewerber – professionell und schnell.',
    icon: 'seite',
    vorteile: [
      'Moderne Karriereseite im Design deines Unternehmens',
      'Alle Stellen, Benefits und Team auf einen Blick',
      'Direkt mit deiner Cloud verbunden – jede Bewerbung landet sofort hier',
      'Besseres Google-Ranking und mehr Vertrauen',
      'Günstigere Anzeigen durch höhere Glaubwürdigkeit',
    ],
    beispiel: CGMS,
  },
  {
    id: 'leistung_growth',
    titel: 'Paket Growth',
    untertitel: 'Die nächste Stufe für dein Recruiting.',
    icon: 'paket',
    vorteile: [
      'Alles aus Starter – plus:',
      'Masterclass für dich und deine Führungskräfte',
      'Content-Paket mit 3 Reels pro Monat',
      'Monatlicher Tracking-Call mit klaren nächsten Schritten',
    ],
    beispiel: CGMS,
  },
  {
    id: 'leistung_scale',
    titel: 'Paket Scale',
    untertitel: 'Für Agenturen, die jetzt richtig wachsen wollen.',
    icon: 'paket',
    vorteile: [
      'Alles aus Growth – plus:',
      'Content-Paket mit 6 Reels pro Monat',
      'Employer Branding und eigene Karriereseite',
      'Tracking-Call alle zwei Wochen',
    ],
    beispiel: BC,
  },
];

export interface FreischaltKarte extends Leistung {
  empfohlen: boolean;
  /** Begründung aus den Zahlen, wenn empfohlen */
  warum: string | null;
}

/**
 * Alle Leistungen, die für diesen Kunden noch gesperrt sind – empfohlene (aus den Zahlen) zuerst.
 * Ausgeblendet: was er schon hat (Persona freigeschaltet, Karriereseite vorhanden, Paket ≥ Stufe).
 */
export function freischaltKarten(lage: KundenLage | null, empfehlungen: Empfehlung[]): FreischaltKarte[] {
  const paket = (lage?.paket ?? '').toLowerCase();
  const empfohlen = new Map(empfehlungen.filter((e) => e.art === 'leistung').map((e) => [e.id, e]));
  return LEISTUNGEN_KATALOG.filter((l) => {
    if (l.id === 'leistung_persona' && lage?.personaFreigeschaltet) return false;
    if (l.id === 'leistung_karriereseite' && (lage?.karriereseite || paket.includes('scale'))) return false;
    if (l.id === 'leistung_growth') return !paket.includes('growth') && !paket.includes('scale');
    if (l.id === 'leistung_scale') return !paket.includes('scale');
    return true;
  })
    .map((l) => ({ ...l, empfohlen: empfohlen.has(l.id), warum: empfohlen.get(l.id)?.warum ?? null }))
    .sort((a, b) => Number(b.empfohlen) - Number(a.empfohlen) || (empfohlen.get(a.id)?.prio ?? 9) - (empfohlen.get(b.id)?.prio ?? 9));
}
