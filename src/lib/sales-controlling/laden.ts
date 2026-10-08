/** Sales-Controlling laden: Zeiträume, Close- und Meta-Daten, Berechnung. */
import { berechneSalesControlling, type Opp } from '@/lib/sales-controlling/compute';
import { ladeAnrufe, ladeAufgaben, ladeClose, ladeErledigteAufgaben, ladeMetaMonate, ladeMetaZeitraum } from '@/lib/sales-controlling/quellen';
import { berechneAuslastung, SCHWELLEN_KEYS, schwellenAus, STANDARD_SCHWELLEN, type Schwellen } from '@/lib/sales-controlling/auslastung';
import { createAdminClient } from '@/lib/supabase/admin';
import { berechneDetails } from '@/lib/sales-controlling/detail';
import { berlinTag } from '@/lib/zeit/berlin';


export const ZIEL = 300_000;

/** Auslastungs-Schwellen aus system_einstellungen (Fallback: Standardwerte) */
async function ladeSchwellen(): Promise<Schwellen> {
  try {
    const { data } = await createAdminClient().from('system_einstellungen').select('key, wert').in('key', Object.keys(SCHWELLEN_KEYS));
    return schwellenAus((data ?? []) as Array<{ key: string; wert: string | null }>);
  } catch {
    return STANDARD_SCHWELLEN;
  }
}
const TAG = 864e5;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monat = (d: Date, delta = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));

export const ZEITRÄUME = ['monat', 'vormonat', 'quartal', 'letztesquartal', '90tage', 'jahr'] as const;
export type Zeitraum = (typeof ZEITRÄUME)[number];

export function zeitraumFür(z: Zeitraum, echtJetzt: Date) {
  // Kalendertag/-monat nach Berliner Zeit – zwischen 0 und 2 Uhr wäre es in UTC noch der Vortag
  const jetzt = new Date(`${berlinTag(echtJetzt)}T12:00:00Z`);
  const morgen = iso(new Date(jetzt.getTime() + TAG));
  switch (z) {
    case 'vormonat': {
      const s = monat(jetzt, -1);
      return { von: iso(s), bis: iso(monat(jetzt)), label: s.toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
    }
    case 'quartal': {
      const q = Math.floor(jetzt.getUTCMonth() / 3) * 3;
      const s = new Date(Date.UTC(jetzt.getUTCFullYear(), q, 1));
      return { von: iso(s), bis: morgen, label: `Q${q / 3 + 1} ${jetzt.getUTCFullYear()} (bisher)` };
    }
    case 'letztesquartal': {
      const q = Math.floor(jetzt.getUTCMonth() / 3) * 3;
      const s = new Date(Date.UTC(jetzt.getUTCFullYear(), q - 3, 1));
      const e = new Date(Date.UTC(jetzt.getUTCFullYear(), q, 1));
      return { von: iso(s), bis: iso(e), label: `Q${Math.floor(s.getUTCMonth() / 3) + 1} ${s.getUTCFullYear()}` };
    }
    case 'jahr': {
      const s = new Date(Date.UTC(jetzt.getUTCFullYear(), 0, 1));
      return { von: iso(s), bis: morgen, label: `Jahr ${jetzt.getUTCFullYear()}` };
    }
    case '90tage':
      return { von: iso(new Date(jetzt.getTime() - 90 * TAG)), bis: morgen, label: 'Letzte 90 Tage' };
    default: {
      const s = monat(jetzt);
      return { von: iso(s), bis: iso(monat(jetzt, 1)), label: s.toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
    }
  }
}

/** Komplettes Sales-Controlling für einen Zeitraum laden (Close + Meta) – für die Seite und den KI-Assistenten */
export async function ladeSalesControlling(z: Zeitraum, jetzt: Date = new Date()) {
  const zeitraum = zeitraumFür(z, jetzt);
    const länge = new Date(zeitraum.bis).getTime() - new Date(zeitraum.von).getTime();
    const vgVon = iso(new Date(new Date(zeitraum.von).getTime() - länge));
    // Statuswechsel mindestens 200 Tage zurück bzw. bis zum Beginn des Vergleichszeitraums (bei „Jahr“)
    const historieAb = [iso(new Date(jetzt.getTime() - 200 * TAG)), vgVon].sort()[0];
    const sechsMonate = iso(monat(jetzt, -5));

    // Anrufe für Zeitraum, Vergleich und den 8-Wochen-Trend
    const anrufeAb = [iso(new Date(jetzt.getTime() - 60 * TAG)), vgVon].sort()[0];

    const [close, metaZeitraum, metaVergleich, metaMonate, anrufe, aufgaben, erledigteAufgaben, schwellen] = await Promise.all([
      // Quellen nur für Deals aus Zeitraum + Vergleichszeitraum nachladen
      ladeClose(historieAb, (opps: Opp[]) => opps.filter((o) => o.date_created >= vgVon && o.date_created < zeitraum.bis)),
      ladeMetaZeitraum(zeitraum.von, zeitraum.bis).catch(() => null),
      ladeMetaZeitraum(vgVon, zeitraum.von).catch(() => null),
      ladeMetaMonate(sechsMonate, iso(jetzt)).catch(() => new Map()),
      ladeAnrufe(anrufeAb).catch((err) => (console.error('[vertrieb] Anrufe', err), null)),
      ladeAufgaben().catch((err) => (console.error('[vertrieb] Aufgaben', err), null)),
      ladeErledigteAufgaben(zeitraum.von).catch((err) => (console.error('[vertrieb] erledigte Aufgaben', err), null)),
      ladeSchwellen(),
    ]);

    return {
      ...berechneSalesControlling({ ...close, metaZeitraum, metaVergleich, metaMonate, zeitraum, jetzt, ziel: ZIEL }),
      metaVerbunden: metaZeitraum !== null,
      details: berechneDetails({
        statuses: close.statuses,
        opps: close.opps,
        events: close.events,
        anrufe: anrufe ?? [],
        aufgaben: aufgaben ?? [],
        users: close.users,
        zeitraum,
        jetzt,
      }),
      auslastung: berechneAuslastung({
        statuses: close.statuses,
        opps: close.opps,
        events: close.events,
        anrufe: anrufe ?? [],
        aufgaben: aufgaben ?? [],
        erledigteAufgaben,
        users: close.users,
        zeitraum,
        jetzt,
        schwellen,
      }),
      telefonieVerbunden: anrufe !== null,
      aufgabenVerbunden: aufgaben !== null,
    };
}
