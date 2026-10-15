/**
 * WhatsApp-Nummer je Kunde: reine, testbare Logik (keine Netzwerk- oder Datenbankzugriffe).
 * – Bestätigungscode aus Anruf-Transkript oder SMS lesen
 * – Ortsvorwahl aus Telefonnummer oder PLZ des Kunden vorschlagen
 * – Status der Twilio-Unterlagen (Regulatory Bundle) übersetzen
 */

import { normalizePhoneE164 } from '@/lib/phone';

// ---------------------------------------------------------------- Code erkennen

const ZAHLWOERTER: Record<string, string> = {
  null: '0', zero: '0',
  eins: '1', ein: '1', one: '1',
  zwei: '2', zwo: '2', two: '2',
  drei: '3', three: '3',
  vier: '4', four: '4',
  fünf: '5', fuenf: '5', five: '5',
  sechs: '6', six: '6',
  sieben: '7', seven: '7',
  acht: '8', eight: '8',
  neun: '9', nine: '9',
};

/** Zeichen, die eine Ziffernfolge nicht unterbrechen ("123-456", "1, 2, 3", "1 2 3.") */
const TRENNER = new Set(['-', ',', '.', ':', '/']);

/** Eine Folge ist ein Code, wenn sie 5–6 Ziffern hat – oder ein 5/6-stelliger Code mehrfach direkt hintereinander steht */
function codeAusFolge(ziffern: string): string | null {
  if (ziffern.length === 5 || ziffern.length === 6) return ziffern;
  for (const n of [6, 5]) {
    if (ziffern.length > n && ziffern.length % n === 0) {
      const teil = ziffern.slice(0, n);
      if (teil.repeat(ziffern.length / n) === ziffern) return teil;
    }
  }
  return null;
}

/**
 * 5–6-stelligen Bestätigungscode aus Text lesen (SMS „123-456 ist dein WhatsApp-Code“ oder
 * Sprach-Transkript „Ihr Code lautet eins zwei drei vier fünf sechs“). Kein eindeutiger Code → null.
 */
export function extrahiereCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const tokens = text.toLowerCase().match(/[a-zäöüß]+|\d+|[^\s\da-zäöüß]/g) ?? [];
  let folge = '';
  const kandidaten: string[] = [];
  const abschliessen = () => {
    const c = codeAusFolge(folge);
    if (c) kandidaten.push(c);
    folge = '';
  };
  for (const t of tokens) {
    if (/^\d+$/.test(t)) folge += t;
    else if (ZAHLWOERTER[t]) folge += ZAHLWOERTER[t];
    else if (TRENNER.has(t)) continue;
    else abschliessen();
  }
  abschliessen();
  return kandidaten[0] ?? null;
}

// ---------------------------------------------------------------- Vorwahl vorschlagen

export interface Vorwahl {
  /** ohne führende 0, z. B. "30" */
  vorwahl: string;
  ort: string;
  quelle: 'telefon' | 'plz' | 'standard';
}

export const STANDARD_VORWAHL: Vorwahl = { vorwahl: '30', ort: 'Berlin', quelle: 'standard' };

/** Ortsnetze größerer Städte (ohne 0). Deutsche Vorwahlen sind präfixfrei → längster Treffer gewinnt. */
const ORTSNETZE: Record<string, string> = {
  '30': 'Berlin', '40': 'Hamburg', '69': 'Frankfurt am Main', '89': 'München',
  '201': 'Essen', '202': 'Wuppertal', '203': 'Duisburg', '208': 'Oberhausen', '209': 'Gelsenkirchen',
  '211': 'Düsseldorf', '212': 'Solingen', '214': 'Leverkusen', '221': 'Köln', '228': 'Bonn',
  '231': 'Dortmund', '234': 'Bochum', '241': 'Aachen', '251': 'Münster', '261': 'Koblenz',
  '271': 'Siegen', '331': 'Potsdam', '341': 'Leipzig', '345': 'Halle (Saale)', '351': 'Dresden',
  '355': 'Cottbus', '361': 'Erfurt', '371': 'Chemnitz', '381': 'Rostock', '385': 'Schwerin',
  '391': 'Magdeburg', '421': 'Bremen', '431': 'Kiel', '441': 'Oldenburg', '451': 'Lübeck',
  '461': 'Flensburg', '471': 'Bremerhaven', '511': 'Hannover', '521': 'Bielefeld', '531': 'Braunschweig',
  '541': 'Osnabrück', '551': 'Göttingen', '561': 'Kassel', '611': 'Wiesbaden', '621': 'Mannheim',
  '631': 'Kaiserslautern', '641': 'Gießen', '651': 'Trier', '661': 'Fulda', '681': 'Saarbrücken',
  '711': 'Stuttgart', '721': 'Karlsruhe', '731': 'Ulm', '761': 'Freiburg im Breisgau', '821': 'Augsburg',
  '831': 'Kempten', '841': 'Ingolstadt', '851': 'Passau', '871': 'Landshut', '911': 'Nürnberg',
  '921': 'Bayreuth', '931': 'Würzburg', '941': 'Regensburg', '951': 'Bamberg',
  '6131': 'Mainz', '6151': 'Darmstadt', '6221': 'Heidelberg', '7131': 'Heilbronn', '7231': 'Pforzheim',
  '5121': 'Hildesheim', '2161': 'Mönchengladbach', '2151': 'Krefeld', '2361': 'Recklinghausen',
};

/** Ortsname zu einer Vorwahl (falls bekannt) */
export function ortZuVorwahl(vorwahl: string): string | null {
  return ORTSNETZE[vorwahl] ?? null;
}

/** "030", "+4930", "30" → "30"; ungültig → null */
export function bereinigeVorwahl(eingabe: string | null | undefined): string | null {
  if (!eingabe) return null;
  let s = eingabe.replace(/[^\d+]/g, '');
  if (s.startsWith('+49')) s = s.slice(3);
  else if (s.startsWith('0049')) s = s.slice(4);
  s = s.replace(/^0+/, '');
  // Festnetz-Ortsnetze beginnen mit 2–9; 15x/16x/17x (Handy), 180/800/900 (Sonderrufnummern), 32 (national) gehören nicht dazu
  if (!/^[2-9]\d{1,4}$/.test(s)) return null;
  if (/^(32|700|800|900)/.test(s)) return null;
  return s;
}

/** Ortsvorwahl aus einer deutschen Festnetznummer – nur für bekannte Ortsnetze (sonst null, Handy → null) */
export function vorwahlAusTelefon(telefon: string | null | undefined): Vorwahl | null {
  const e164 = normalizePhoneE164(telefon);
  if (!e164?.startsWith('+49')) return null;
  const national = e164.slice(3);
  if (/^1/.test(national)) return null; // Handy- und Sondernummern
  for (const laenge of [5, 4, 3, 2]) {
    const v = national.slice(0, laenge);
    if (ORTSNETZE[v] && national.length > laenge + 2) return { vorwahl: v, ort: ORTSNETZE[v], quelle: 'telefon' };
  }
  return null;
}

/** PLZ-Bereiche großer Städte (Näherung) → Ortsvorwahl */
const PLZ_BEREICHE: Array<[number, number, string]> = [
  [10115, 14199, '30'],
  [20095, 21149, '40'], [22041, 22769, '40'],
  [80331, 81929, '89'],
  [50667, 51149, '221'],
  [60306, 60599, '69'], [65929, 65936, '69'],
  [70173, 70629, '711'],
  [40210, 40629, '211'],
  [44135, 44388, '231'],
  [45127, 45359, '201'],
  [4103, 4357, '341'],
  [1067, 1328, '351'],
  [28195, 28779, '421'],
  [30159, 30669, '511'],
  [90402, 90491, '911'],
];

export function vorwahlAusPlz(plz: string | null | undefined): Vorwahl | null {
  const s = (plz ?? '').replace(/\D/g, '');
  if (s.length !== 5) return null;
  const n = Number(s);
  const treffer = PLZ_BEREICHE.find(([von, bis]) => n >= von && n <= bis);
  return treffer ? { vorwahl: treffer[2], ort: ORTSNETZE[treffer[2]], quelle: 'plz' } : null;
}

/** Vorschlag: zuerst Vorwahl der bisherigen Festnetznummer des Kunden, dann PLZ des Firmensitzes, sonst Berlin 030 */
export function vorschlagVorwahl(x: { telefone?: Array<string | null | undefined>; plz?: string | null }): Vorwahl {
  for (const t of x.telefone ?? []) {
    const v = vorwahlAusTelefon(t);
    if (v) return v;
  }
  return vorwahlAusPlz(x.plz) ?? STANDARD_VORWAHL;
}

/** +4930123456 → "+49 30 123456" (bekanntes Ortsnetz), sonst unverändert */
export function nummerAnzeigen(e164: string | null | undefined): string {
  if (!e164) return '';
  const v = vorwahlAusTelefon(e164);
  return v ? `+49 ${v.vorwahl} ${e164.slice(3 + v.vorwahl.length)}` : e164;
}

// ---------------------------------------------------------------- Unterlagen (Regulatory Bundle)

export type BundleTon = 'success' | 'warning' | 'danger' | 'neutral';

export interface BundleStatus {
  label: string;
  ton: BundleTon;
  /** Mit diesen Unterlagen darf eine Nummer gekauft werden */
  kaufbar: boolean;
}

export function bundleStatus(status: string | null | undefined): BundleStatus {
  switch (status) {
    case 'twilio-approved':
      return { label: 'Freigegeben', ton: 'success', kaufbar: true };
    case 'provisionally-approved':
      return { label: 'Vorläufig freigegeben', ton: 'success', kaufbar: true };
    case 'pending-review':
    case 'in-review':
      return { label: 'In Prüfung bei Twilio', ton: 'warning', kaufbar: false };
    case 'draft':
      return { label: 'Entwurf – noch nicht eingereicht', ton: 'neutral', kaufbar: false };
    case 'twilio-rejected':
      return { label: 'Abgelehnt', ton: 'danger', kaufbar: false };
    default:
      return { label: status ? `Unbekannt (${status})` : 'Keine Unterlagen', ton: 'neutral', kaufbar: false };
  }
}

// ---------------------------------------------------------------- Kauf prüfen

export interface KaufVoraussetzungen {
  twilioBereit: boolean;
  schemaBereit: boolean;
  freigegeben: boolean;
  unterkonto: boolean;
  schonGekauft: boolean;
  bundle: string | null | undefined;
  adresse: boolean;
  bestaetigt: boolean;
}

/** Warum (noch) keine Nummer gekauft werden darf – null = alles erfüllt */
export function kaufGrund(k: KaufVoraussetzungen): string | null {
  if (!k.twilioBereit) return 'Twilio ist noch nicht eingerichtet';
  if (!k.schemaBereit) return 'Datenbank-Änderung fehlt noch';
  if (!k.freigegeben) return '„WhatsApp-Nummer besorgen“ ist noch nicht freigegeben';
  if (!k.unterkonto) return 'Zuerst das Twilio-Unterkonto anlegen';
  if (k.schonGekauft) return 'Für diesen Kunden ist schon eine Nummer gekauft';
  if (!bundleStatus(k.bundle).kaufbar) return 'Die Unterlagen (Regulatory Bundle) sind noch nicht von Twilio freigegeben';
  if (!k.adresse) return 'Im Unterkonto ist keine deutsche Adresse hinterlegt';
  if (!k.bestaetigt) return 'Bitte den Kauf ausdrücklich bestätigen';
  return null;
}

/** Gekaufte Nummer muss eine deutsche E.164-Nummer sein */
export function istDeutscheNummer(nummer: unknown): nummer is string {
  return typeof nummer === 'string' && /^\+49[2-9]\d{5,12}$/.test(nummer);
}

/** Ist das Code-Zeitfenster gerade offen? */
export function codeEmpfangOffen(bis: string | null | undefined, jetzt = Date.now()): boolean {
  return !!bis && new Date(bis).getTime() > jetzt;
}
