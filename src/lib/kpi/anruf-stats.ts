/**
 * Anruf-Statistik der Kunden-Cloud (wie in der BC Recruiting Cloud):
 * Ergebnisse, Erreichbarkeit, Anrufe je Person, Speed-to-Lead und No-Show-Quote.
 */

export const ERGEBNIS_LABEL: Record<string, string> = {
  termin_vereinbart: 'Termin vereinbart',
  rueckruf: 'Rückruf gewünscht',
  kein_interesse: 'Kein Interesse',
  nicht_erreicht: 'Nicht erreicht',
  falsche_nummer: 'Falsche Nummer',
  sonstiges: 'Sonstiges',
};

/** Ergebnisse, bei denen jemand am Telefon war */
export const ERREICHT = ['termin_vereinbart', 'kein_interesse', 'rueckruf', 'sonstiges'];

export interface AnrufStats {
  gesamt: number;
  erreicht: number;
  /** 0–1, null ohne Anrufe */
  erreichbarkeit: number | null;
  termine: number;
  proErgebnis: Array<{ ergebnis: string; label: string; anzahl: number }>;
  proPerson: Array<{ user_id: string | null; name: string; gesamt: number; erreicht: number; termine: number; erreichbarkeit: number | null }>;
  /** Ø Sekunden bis zum ersten Kontakt (Bewerber aus dem Zeitraum) */
  speedToLeadSek: number | null;
  speedToLeadAnzahl: number;
  /** Termine im Zeitraum, die schon stattfinden sollten */
  termineVergangen: number;
  noShows: number;
  /** 0–1, null ohne abgeschlossene Termine */
  noShowQuote: number | null;
}

export function berechneAnrufStats(
  anrufe: Array<{ user_id: string | null; result: string | null }>,
  namen: Map<string, string>,
  ttfc: Array<number | null>,
  termine: Array<{ status: string | null; scheduled_at: string }>,
  jetzt: Date,
): AnrufStats {
  const gesamt = anrufe.length;
  const istErreicht = (r: string | null) => !!r && ERREICHT.includes(r);
  const erreicht = anrufe.filter((a) => istErreicht(a.result)).length;
  const terminAnrufe = anrufe.filter((a) => a.result === 'termin_vereinbart').length;

  const zaehler = new Map<string, number>();
  for (const a of anrufe) zaehler.set(a.result ?? 'sonstiges', (zaehler.get(a.result ?? 'sonstiges') ?? 0) + 1);
  const proErgebnis = [...zaehler.entries()]
    .map(([ergebnis, anzahl]) => ({ ergebnis, label: ERGEBNIS_LABEL[ergebnis] ?? ergebnis, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl);

  const personen = new Map<string, Array<{ result: string | null }>>();
  for (const a of anrufe) {
    const k = a.user_id ?? '';
    personen.set(k, [...(personen.get(k) ?? []), a]);
  }
  const proPerson = [...personen.entries()]
    .map(([k, liste]) => {
      const e = liste.filter((a) => istErreicht(a.result)).length;
      return {
        user_id: k || null,
        name: (k && namen.get(k)) || 'Unbekannt',
        gesamt: liste.length,
        erreicht: e,
        termine: liste.filter((a) => a.result === 'termin_vereinbart').length,
        erreichbarkeit: liste.length ? e / liste.length : null,
      };
    })
    .sort((a, b) => b.gesamt - a.gesamt || a.name.localeCompare(b.name, 'de'));

  const sek = ttfc.filter((x): x is number => typeof x === 'number' && x >= 0);
  const vergangen = termine.filter((t) => new Date(t.scheduled_at) <= jetzt && t.status !== 'abgesagt');
  const noShows = vergangen.filter((t) => t.status === 'no_show').length;
  // Quote nur über Termine mit Ergebnis (erschienen oder no_show)
  const abgeschlossen = vergangen.filter((t) => t.status === 'erschienen' || t.status === 'no_show').length;

  return {
    gesamt,
    erreicht,
    erreichbarkeit: gesamt ? erreicht / gesamt : null,
    termine: terminAnrufe,
    proErgebnis,
    proPerson,
    speedToLeadSek: sek.length ? Math.round(sek.reduce((s, x) => s + x, 0) / sek.length) : null,
    speedToLeadAnzahl: sek.length,
    termineVergangen: vergangen.length,
    noShows,
    noShowQuote: abgeschlossen ? noShows / abgeschlossen : null,
  };
}

/** „4 Min.“ / „2,5 Std.“ / „1,2 Tage“ */
export function dauerText(sek: number | null): string {
  if (sek === null) return '–';
  if (sek < 3600) return `${Math.max(1, Math.round(sek / 60))} Min.`;
  if (sek < 86400) return `${(sek / 3600).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Std.`;
  return `${(sek / 86400).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Tage`;
}
