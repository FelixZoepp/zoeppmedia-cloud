/** Kundenhistorie (Direktvertrieb): Upsell, Rückgewinnung, Kündigungsgrund – Grundlage für Quoten im Masterplan */

export const KUENDIGUNGSGRUENDE = [
  'Ergebnisse',
  'Preis',
  'Eigener Vertrieb gescheitert',
  'Kunde setzt nicht um',
  'Kommunikation',
  'Ghosting',
  'Zahlungsausfall / Streitfall',
  'Insolvenz / Firma aufgelöst',
  'Laufzeit ausgelaufen',
  'Projekt beendet',
  'Sonstiges',
] as const;
export type Kuendigungsgrund = (typeof KUENDIGUNGSGRUENDE)[number];

export interface KundeStatus {
  id: string;
  kunde: string;
  segment: 'd2d' | 'sonstige' | 'raus';
  upsell: boolean | null;
  rueckgewinnung: boolean | null;
  aktiv: boolean;
  kuendigungsgrund: Kuendigungsgrund | null;
  notiz: string | null;
}

/** Gekündigte Direktvertriebskunden nach Grund (ohne Grund = „offen“), größte zuerst */
export function churnNachGrund(kunden: KundeStatus[]): Array<{ grund: string; anzahl: number; kunden: string[] }> {
  const m = new Map<string, string[]>();
  for (const k of kunden) {
    if (k.segment !== 'd2d' || k.aktiv) continue;
    const g = k.kuendigungsgrund ?? 'Grund offen';
    m.set(g, [...(m.get(g) ?? []), k.kunde]);
  }
  return [...m.entries()].map(([grund, liste]) => ({ grund, anzahl: liste.length, kunden: liste.sort() })).sort((a, b) => b.anzahl - a.anzahl);
}
