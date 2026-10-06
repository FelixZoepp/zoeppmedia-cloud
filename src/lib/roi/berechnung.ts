/**
 * ROI der Recruiting-Kampagne: Umsatz der neu eingestellten Vertriebler (vom Kunden je Monat
 * eingetragen) im Verhältnis zu den Kosten (Retainer + Werbebudget). Rein (keine I/O) – testbar.
 */

export interface Einstellung {
  id: string;
  name: string;
  /** Datum der Einstellung (ISO) */
  eingestellt_am: string;
}

export interface UmsatzEintrag {
  candidate_id: string;
  /** Erster Tag des Monats, YYYY-MM-01 */
  monat: string;
  umsatz: number;
  provision: number | null;
  aktiv: boolean;
}

export interface Kosten {
  /** Monatlicher Retainer netto */
  mrr: number | null;
  /** Monatliches Werbebudget */
  werbebudget: number | null;
  /** Beginn der Zusammenarbeit (YYYY-MM-DD) */
  start: string | null;
}

export interface RoiMonat {
  monat: string;
  umsatz: number;
  provision: number;
  aktive: number;
  eintraege: number;
  kosten: number | null;
  roi: number | null;
}

/** YYYY-MM-01 eines Datums (UTC) */
export function monatVon(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function monatPlus(monat: string, delta: number): string {
  const [y, m] = monat.split('-').map(Number);
  return monatVon(new Date(Date.UTC(y, m - 1 + delta, 1)));
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function berechneRoi(e: { einstellungen: Einstellung[]; eintraege: UmsatzEintrag[]; kosten: Kosten; jetzt: Date; anzahlMonate?: number }) {
  const n = e.anzahlMonate ?? 12;
  const aktuell = monatVon(e.jetzt);
  const letzter = monatPlus(aktuell, -1);
  const vorletzter = monatPlus(aktuell, -2);
  const startMonat = e.kosten.start ? monatVon(e.kosten.start) : null;
  const kostenMonat = (e.kosten.mrr ?? 0) + (e.kosten.werbebudget ?? 0) || null;
  const kostenFuer = (m: string) => (kostenMonat === null || (startMonat && m < startMonat) ? null : kostenMonat);

  const proMonat = new Map<string, UmsatzEintrag[]>();
  for (const x of e.eintraege) proMonat.set(x.monat, [...(proMonat.get(x.monat) ?? []), x]);

  const monate: RoiMonat[] = Array.from({ length: n }, (_, i) => monatPlus(aktuell, i - n + 1)).map((m) => {
    const liste = proMonat.get(m) ?? [];
    const umsatz = liste.reduce((s, x) => s + x.umsatz, 0);
    const kosten = kostenFuer(m);
    return {
      monat: m,
      umsatz,
      provision: liste.reduce((s, x) => s + (x.provision ?? 0), 0),
      aktive: liste.filter((x) => x.aktiv).length,
      eintraege: liste.length,
      kosten,
      roi: kosten && liste.length ? r1(umsatz / kosten) : null,
    };
  });

  const summe = (m: string) => (proMonat.get(m) ?? []).reduce((s, x) => s + x.umsatz, 0);
  const umsatzLetzter = summe(letzter);
  const umsatzVorletzter = summe(vorletzter);
  const hatLetzter = (proMonat.get(letzter) ?? []).length > 0;

  // Kumuliert seit Start: alle eingetragenen Umsätze ÷ Kosten aller Monate seit Beginn bis zum letzten abgeschlossenen
  const ersteEintragMonat = [...proMonat.keys()].sort()[0] ?? null;
  const kumStart = startMonat ?? ersteEintragMonat;
  let kumKosten = 0;
  if (kostenMonat && kumStart) for (let m = kumStart; m <= letzter; m = monatPlus(m, 1)) kumKosten += kostenMonat;
  const kumUmsatz = e.eintraege.filter((x) => x.monat <= letzter).reduce((s, x) => s + x.umsatz, 0);

  // Pflicht: wer im letzten Monat schon eingestellt war und nicht vorher als „nicht mehr dabei“ markiert wurde
  const fehlend = e.einstellungen
    .filter((h) => monatVon(h.eingestellt_am) <= letzter)
    .filter((h) => {
      const eigene = e.eintraege.filter((x) => x.candidate_id === h.id).sort((a, b) => a.monat.localeCompare(b.monat));
      if (eigene.some((x) => x.monat === letzter)) return false;
      const davor = eigene.filter((x) => x.monat < letzter).pop();
      return !davor || davor.aktiv;
    })
    .map((h) => ({ id: h.id, name: h.name }));

  return {
    monate,
    letzterMonat: letzter,
    umsatzLetzterMonat: hatLetzter ? umsatzLetzter : null,
    umsatzVormonat: umsatzVorletzter,
    wachstumProzent: hatLetzter && umsatzVorletzter > 0 ? r1(((umsatzLetzter - umsatzVorletzter) / umsatzVorletzter) * 100) : null,
    roiLetzterMonat: hatLetzter && kostenFuer(letzter) ? r1(umsatzLetzter / kostenFuer(letzter)!) : null,
    roiKumuliert: kumKosten > 0 && kumUmsatz > 0 ? r1(kumUmsatz / kumKosten) : null,
    umsatzGesamt: kumUmsatz,
    kostenGesamt: kumKosten || null,
    kostenProMonat: kostenMonat,
    aktiveVertriebler: (proMonat.get(letzter) ?? []).filter((x) => x.aktiv).length,
    einstellungen: e.einstellungen.length,
    fehlend,
  };
}

export type RoiErgebnis = ReturnType<typeof berechneRoi>;
