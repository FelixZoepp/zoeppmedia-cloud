/**
 * Stehende Deals: aktive Opportunities in Close, bei denen sich seit 7+ Tagen nichts bewegt hat
 * (keine Aktivität am Lead, Opportunity nicht geändert). Dazu: Gibt es eine offene Aufgabe (nächster Schritt)?
 * Für Sales-Controlling (Liste) und CEO-Briefing (Alarm). Nur lesen – in Close wird nichts geändert.
 */

const CLOSE = 'https://api.close.com/api/v1';
export const STEHT_AB_TAGEN = 7;

function headers(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}` };
}

async function close<T>(path: string): Promise<T> {
  const res = await fetch(`${CLOSE}${path}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${path.split('?')[0]}`);
  return res.json() as Promise<T>;
}

export interface StehenderDeal {
  oppId: string;
  leadId: string;
  firma: string;
  status: string;
  wert: number;
  verantwortlich: string | null;
  letzteBewegung: string;
  tage: number;
  naechsterSchritt: string | null;
}

interface Opp {
  id: string;
  lead_id: string;
  lead_name: string | null;
  status_label: string;
  value: number | null;
  user_name: string | null;
  date_updated: string;
}

/** Tage ohne Bewegung (rein, testbar) */
export function tageOhneBewegung(letzte: string, jetzt: Date): number {
  return Math.floor((jetzt.getTime() - new Date(letzte).getTime()) / 864e5);
}

/** Begrenzt parallele Close-Abfragen (Rate-Limit) */
async function jeweils<T, R>(liste: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(liste.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, liste.length) }, async () => {
      while (i < liste.length) {
        const k = i++;
        out[k] = await f(liste[k]);
      }
    }),
  );
  return out;
}

export async function ladeStehendeDeals(jetzt: Date = new Date(), abTagen = STEHT_AB_TAGEN): Promise<{ deals: StehenderDeal[]; aktiv: number; summe: number }> {
  const opps: Opp[] = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const r = await close<{ data: Opp[]; has_more: boolean }>(`/opportunity/?status_type=active&_skip=${skip}&_limit=100&_fields=id,lead_id,lead_name,status_label,value,user_name,date_updated`);
    opps.push(...r.data);
    if (!r.has_more) break;
  }
  const grenze = jetzt.getTime() - abTagen * 864e5;
  // Erst grob nach Opportunity-Änderung filtern, dann je Lead die letzte Aktivität + offene Aufgabe nachsehen
  const kandidaten = opps.filter((o) => new Date(o.date_updated).getTime() < grenze);
  const geprueft = await jeweils(kandidaten, 4, async (o) => {
    const [akt, auf] = await Promise.all([
      close<{ data: Array<{ date_created: string }> }>(`/activity/?lead_id=${o.lead_id}&_limit=1&_fields=date_created`).catch(() => ({ data: [] })),
      close<{ data: Array<{ text: string; date: string | null }> }>(`/task/?lead_id=${o.lead_id}&is_complete=false&_limit=1&_order_by=date&_fields=text,date`).catch(() => ({ data: [] })),
    ]);
    const letzte = [o.date_updated, akt.data[0]?.date_created].filter(Boolean).sort().pop() as string;
    const a = auf.data[0];
    return {
      oppId: o.id,
      leadId: o.lead_id,
      firma: o.lead_name ?? 'Unbekannt',
      status: o.status_label,
      wert: (o.value ?? 0) / 100,
      verantwortlich: o.user_name,
      letzteBewegung: letzte,
      tage: tageOhneBewegung(letzte, jetzt),
      naechsterSchritt: a ? `${a.text}${a.date ? ` (${new Date(a.date).toLocaleDateString('de-DE')})` : ''}` : null,
    } satisfies StehenderDeal;
  });
  const deals = geprueft.filter((d) => d.tage >= abTagen).sort((x, y) => y.wert - x.wert || y.tage - x.tage);
  return { deals, aktiv: opps.length, summe: deals.reduce((s, d) => s + d.wert, 0) };
}
