/**
 * Bereiche im Team (users.funktion), gruppiert nach Abteilung.
 * Reihenfolge = Reihenfolge auf der Team-Seite.
 */
export const ABTEILUNGEN = [
  { value: 'sales', label: 'Sales', beschreibung: 'Vertriebsleitung, Setting und Closing' },
  { value: 'marketing', label: 'Marketing', beschreibung: 'Ads, Funnel und Content' },
  { value: 'fulfillment', label: 'Fulfillment', beschreibung: 'Kundenbetreuung und Operations' },
  { value: 'verwaltung', label: 'Verwaltung', beschreibung: 'Buchhaltung und Mahnwesen' },
] as const;

export type Abteilung = (typeof ABTEILUNGEN)[number]['value'];

export const BEREICHE = [
  { value: 'vertrieb', abteilung: 'sales', label: 'Vertriebsleitung', beschreibung: 'Steuert Setting & Closing, Sales-Controlling' },
  { value: 'setter', abteilung: 'sales', label: 'Setting', beschreibung: 'Erstgespräche & Terminierung' },
  { value: 'closer', abteilung: 'sales', label: 'Closing', beschreibung: 'Abschlussgespräche & Angebote' },
  { value: 'media_buyer', abteilung: 'marketing', label: 'Ads & Funnel', beschreibung: 'Ads, Videos, Funnel & Tracking' },
  { value: 'content', abteilung: 'marketing', label: 'Content', beschreibung: 'Content & Skripte' },
  { value: 'csm', abteilung: 'fulfillment', label: 'Kundenbetreuung', beschreibung: 'Kundenbetreuung & Calls' },
  { value: 'ops', abteilung: 'fulfillment', label: 'Operations', beschreibung: 'Operations' },
  { value: 'backoffice', abteilung: 'verwaltung', label: 'Buchhaltung', beschreibung: 'Buchhaltung & Mahnwesen' },
] as const;

export type Bereich = (typeof BEREICHE)[number]['value'];

export const BEREICH_LABEL: Record<string, string> = Object.fromEntries(BEREICHE.map((b) => [b.value, b.label]));

/** Bereiche, die das Sales-Controlling sehen */
export const SALES_BEREICHE: readonly string[] = BEREICHE.filter((b) => b.abteilung === 'sales').map((b) => b.value);

export function abteilungVon(funktion: string | null | undefined): Abteilung | null {
  return BEREICHE.find((b) => b.value === funktion)?.abteilung ?? null;
}

export function istBereich(v: unknown): v is Bereich {
  return typeof v === 'string' && BEREICHE.some((b) => b.value === v);
}

/** Postgres-Check-Constraint verletzt → Datenbank kennt den Bereich noch nicht (Migration fehlt) */
export function bereichFehltInDb(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23514';
}
