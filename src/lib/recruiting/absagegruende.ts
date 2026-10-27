/**
 * Absagegründe: fester Katalog, damit Absagen auswertbar sind (Kunde + intern).
 * Bewusst KEINE Gründe zu Alter, Geschlecht, Herkunft, Religion, Behinderung o. Ä. –
 * das wäre nach AGG unzulässig und ein Beweis gegen den Kunden (Auskunftsrecht DSGVO Art. 15).
 */

export const ABSAGE_GRUPPEN = [
  { key: 'erscheinen', label: 'Erreichbarkeit & Erscheinen' },
  { key: 'eindruck', label: 'Eindruck im Gespräch' },
  { key: 'voraussetzungen', label: 'Voraussetzungen' },
  { key: 'erwartung', label: 'Erwartungen' },
  { key: 'probetag', label: 'Nach dem Probetag' },
  { key: 'sonstiges', label: 'Sonstiges' },
] as const;

export type AbsageGruppe = (typeof ABSAGE_GRUPPEN)[number]['key'];

export interface AbsageGrund {
  code: string;
  label: string;
  gruppe: AbsageGruppe;
  /** Freitext ist Pflicht */
  notizPflicht?: boolean;
}

export const ABSAGE_GRUENDE: AbsageGrund[] = [
  { code: 'nicht_erreichbar', label: 'Nicht erreichbar', gruppe: 'erscheinen' },
  { code: 'termin_nicht_erschienen', label: 'Zum Gespräch nicht erschienen', gruppe: 'erscheinen' },
  { code: 'probetag_nicht_erschienen', label: 'Zum Probetag nicht erschienen', gruppe: 'erscheinen' },
  { code: 'wenig_energie', label: 'Wenig Energie / Einsatzbereitschaft am Telefon', gruppe: 'eindruck' },
  { code: 'keine_motivation', label: 'Keine Motivation erkennbar', gruppe: 'eindruck' },
  { code: 'auftreten', label: 'Auftreten / Kommunikation passt nicht', gruppe: 'eindruck' },
  { code: 'kein_fuehrerschein', label: 'Kein Führerschein / kein Auto', gruppe: 'voraussetzungen' },
  { code: 'sprache', label: 'Sprachkenntnisse reichen nicht', gruppe: 'voraussetzungen' },
  { code: 'zeitlich_nicht_verfuegbar', label: 'Zeitlich nicht verfügbar', gruppe: 'voraussetzungen' },
  { code: 'unter_18', label: 'Unter 18', gruppe: 'voraussetzungen' },
  { code: 'nur_festanstellung', label: 'Will nur Festanstellung', gruppe: 'erwartung' },
  { code: 'verdienst_erwartung', label: 'Falsche Verdienst-Erwartung', gruppe: 'erwartung' },
  { code: 'nach_probetag_abgelehnt', label: 'Nach Probetag abgelehnt', gruppe: 'probetag' },
  { code: 'nach_probetag_selbst_abgesagt', label: 'Hat nach Probetag selbst abgesagt', gruppe: 'probetag' },
  { code: 'bewerber_abgesagt', label: 'Bewerber hat selbst abgesagt', gruppe: 'sonstiges' },
  { code: 'sonstiges', label: 'Sonstiges', gruppe: 'sonstiges', notizPflicht: true },
];

/** Altbestand ohne Code (Schnell-Absage vor Einführung des Katalogs) – nicht auswählbar */
export const ABSAGE_OHNE_GRUND = { code: 'ohne_grund', label: 'Ohne Grund (alt)' } as const;

const NACH_CODE = new Map(ABSAGE_GRUENDE.map((g) => [g.code, g]));

export function absageGrund(code: string | null | undefined): AbsageGrund | null {
  return (code && NACH_CODE.get(code)) || null;
}

export function absageLabel(code: string | null | undefined): string {
  if (code === ABSAGE_OHNE_GRUND.code) return ABSAGE_OHNE_GRUND.label;
  return absageGrund(code)?.label ?? 'Unbekannt';
}

export function gruppeLabel(key: string): string {
  return ABSAGE_GRUPPEN.find((g) => g.key === key)?.label ?? 'Sonstiges';
}

export const NOTIZ_MAX = 500;

/** Eingabe prüfen (Server + Oberfläche). Ergebnis: bereinigte Werte oder Fehlertext. */
export function pruefeAbsage(raw: unknown): { code: string; notiz: string | null } | { fehler: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const grund = absageGrund(typeof r.code === 'string' ? r.code : null);
  if (!grund) return { fehler: 'Bitte einen Absagegrund wählen.' };
  const notiz = typeof r.notiz === 'string' ? r.notiz.trim().slice(0, NOTIZ_MAX) : '';
  if (grund.notizPflicht && !notiz) return { fehler: 'Bei „Sonstiges“ bitte kurz den Grund eintragen.' };
  return { code: grund.code, notiz: notiz || null };
}

/** Text für candidates.ablehngrund (Anzeige in Altansichten) */
export function ablehngrundText(code: string, notiz: string | null): string {
  const label = absageLabel(code);
  return notiz ? `${label}: ${notiz}` : label;
}

/**
 * Hinweis, wenn eine Notiz nach einem AGG-Merkmal klingt. Blockiert nicht – warnt nur.
 */
const AGG_MUSTER =
  /\b(zu alt|zu jung|alter|jahrgang|geschlecht|frau|mann|weiblich|männlich|schwanger|kinder|kopftuch|religion|muslim|christ|jude|herkunft|ausländer|nationalität|hautfarbe|rasse|behindert|behinderung|krank|homosexuell|schwul|lesbisch|trans)\b/i;

export function aggHinweis(notiz: string | null | undefined): boolean {
  return !!notiz && AGG_MUSTER.test(notiz);
}

/** Felder für candidates bei einer Absage */
export function absageFelder(a: { code: string; notiz: string | null; userId: string | null; phaseId: string | null; jetzt?: string }) {
  return {
    ablehngrund: ablehngrundText(a.code, a.notiz),
    absage_code: a.code,
    absage_notiz: a.notiz,
    abgesagt_am: a.jetzt ?? new Date().toISOString(),
    abgesagt_von: a.userId,
    absage_phase_id: a.phaseId,
  };
}

/** Felder leeren, wenn ein Bewerber wieder aktiv wird (zählt dann nicht mehr als Absage) */
export const ABSAGE_LEER = {
  ablehngrund: null,
  absage_code: null,
  absage_notiz: null,
  abgesagt_am: null,
  abgesagt_von: null,
  absage_phase_id: null,
} as const;

/** Texte der alten Absage-Liste (Kanban/Tabelle vor dem Katalog) → Code */
const ALT_TEXTE: Record<string, string> = {
  'Nicht erschienen zum Probetag': 'probetag_nicht_erschienen',
  'Nach Probetag abgelehnt': 'nach_probetag_abgelehnt',
  'Mangelnde Einsatzbereitschaft': 'wenig_energie',
  'Kein Führerschein / Kein Auto': 'kein_fuehrerschein',
  Sprachbarriere: 'sprache',
  'Nur Festanstellung gewünscht': 'nur_festanstellung',
  Minderjährig: 'unter_18',
  'Keine Motivation erkennbar': 'keine_motivation',
  'Bewerber hat abgesagt': 'bewerber_abgesagt',
  'Nicht erreichbar (nach 3 Versuchen)': 'nicht_erreichbar',
  'Falsche Erwartungen an den Verdienst': 'verdienst_erwartung',
};

/**
 * Absage aus einem Request-Body: neues Format { absage: { code, notiz } },
 * sonst Alt-Feld rejection_reason (Katalog-Label/alter Text → Code, Rest → „Sonstiges“ mit Notiz).
 */
export function absageAusBody(body: unknown): { code: string; notiz: string | null } | { fehler: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (b.absage) return pruefeAbsage(b.absage);
  const text = typeof b.rejection_reason === 'string' ? b.rejection_reason.trim() : '';
  if (!text) return { fehler: 'Bitte einen Absagegrund wählen.' };
  const code = ALT_TEXTE[text] ?? ABSAGE_GRUENDE.find((g) => g.label === text)?.code;
  if (code && code !== 'sonstiges') return { code, notiz: null };
  return { code: 'sonstiges', notiz: text.slice(0, NOTIZ_MAX) };
}
