/**
 * Upsell-Wächter: offene Deals der Pipeline „Upsell (Bestandskunden)“ dürfen nicht liegen bleiben.
 * Je Deal: Gibt es einen nächsten Schritt (offene Aufgabe oder künftiger Termin in Close)? Wann war die letzte Aktivität?
 * Mit Freigabe „upsell_waechter“: Deal ohne nächsten Schritt → Close-Aufgabe für den Deal-Besitzer (einmal, bis sie erledigt ist).
 * Meldung im CEO-Briefing. Keine Nachricht an Kunden.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { istFreigegeben } from '@/lib/freigaben';
import { UPSELL_FILTER } from './pipelines';

const CLOSE = 'https://api.close.com/api/v1';
export const UPSELL_STEHT_AB_TAGEN = 5;
export const AUFGABE_PREFIX = '🔁 Upsell';

function headers(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}

async function close<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLOSE}${path}`, { ...init, headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${path.split('?')[0]}`);
  return res.json() as Promise<T>;
}

export interface UpsellDeal {
  oppId: string;
  leadId: string;
  firma: string;
  stufe: string;
  wert: number;
  userId: string | null;
  letzteBewegung: string;
  tageOhneBewegung: number;
  naechsterSchritt: string | null;
  /** offene Wächter-Aufgabe „🔁 Upsell …“ existiert schon */
  waechterAufgabeOffen: boolean;
}

/** Braucht der Deal Aufmerksamkeit? (rein, testbar) */
export function problemVon(d: Pick<UpsellDeal, 'naechsterSchritt' | 'tageOhneBewegung'>, abTagen = UPSELL_STEHT_AB_TAGEN): 'kein_schritt' | 'steht' | null {
  if (!d.naechsterSchritt) return 'kein_schritt';
  if (d.tageOhneBewegung >= abTagen) return 'steht';
  return null;
}

export function aufgabenText(firma: string, wert: number): string {
  return `${AUFGABE_PREFIX} ${firma} (${Math.round(wert).toLocaleString('de-DE')} €): nächsten Schritt festlegen – Termin legen oder Aufgabe mit Datum`;
}

type Opp = { id: string; lead_id: string; lead_name: string | null; status_label: string; value: number | null; user_id: string | null; date_updated: string };

/** Alle offenen Upsell-Deals mit nächstem Schritt und letzter Bewegung (nur lesen) */
export async function ladeUpsellDeals(jetzt: Date = new Date()): Promise<UpsellDeal[]> {
  const { data } = await close<{ data: Opp[] }>(
    `/opportunity/?${UPSELL_FILTER}&status_type=active&_limit=200&_fields=id,lead_id,lead_name,status_label,value,user_id,date_updated`,
  );
  const out: UpsellDeal[] = [];
  for (const o of data) {
    const [akt, aufgaben, termine] = await Promise.all([
      close<{ data: Array<{ date_created: string }> }>(`/activity/?lead_id=${o.lead_id}&_limit=1&_fields=date_created`).catch(() => ({ data: [] })),
      close<{ data: Array<{ text: string; date: string | null }> }>(`/task/?lead_id=${o.lead_id}&is_complete=false&_limit=20&_fields=text,date`).catch(() => ({ data: [] })),
      close<{ data: Array<{ starts_at: string | null; title?: string | null }> }>(`/activity/meeting/?lead_id=${o.lead_id}&_limit=10&_fields=starts_at,title`).catch(() => ({ data: [] })),
    ]);
    const letzte = [o.date_updated, akt.data[0]?.date_created].filter(Boolean).sort().pop() as string;
    const termin = termine.data.filter((t) => t.starts_at && new Date(t.starts_at).getTime() > jetzt.getTime()).sort((a, b) => a.starts_at!.localeCompare(b.starts_at!))[0];
    const echteAufgabe = aufgaben.data.filter((t) => !t.text.startsWith(AUFGABE_PREFIX)).sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9'))[0];
    const naechsterSchritt = termin
      ? `Termin ${new Date(termin.starts_at!).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}${termin.title ? ` (${termin.title})` : ''}`
      : echteAufgabe
        ? `${echteAufgabe.text}${echteAufgabe.date ? ` (${new Date(echteAufgabe.date).toLocaleDateString('de-DE')})` : ''}`
        : null;
    out.push({
      oppId: o.id,
      leadId: o.lead_id,
      firma: o.lead_name ?? 'Unbekannt',
      stufe: o.status_label.replace(/^Upsell\s*-\s*/i, ''),
      wert: (o.value ?? 0) / 100,
      userId: o.user_id,
      letzteBewegung: letzte,
      tageOhneBewegung: Math.max(0, Math.floor((jetzt.getTime() - new Date(letzte).getTime()) / 864e5)),
      naechsterSchritt,
      waechterAufgabeOffen: aufgaben.data.some((t) => t.text.startsWith(AUFGABE_PREFIX)),
    });
  }
  return out.sort((a, b) => b.wert - a.wert);
}

/** Täglich (Cron): Deals ohne nächsten Schritt bekommen eine Close-Aufgabe – nur mit Freigabe */
export async function pruefeUpsellDeals(svc: SupabaseClient, jetzt: Date = new Date()): Promise<{ deals: number; aufgaben: number } | 'freigabe_aus'> {
  if (!(await istFreigegeben(svc, 'upsell_waechter'))) return 'freigabe_aus';
  if (!process.env.CLOSE_API_KEY) return { deals: 0, aufgaben: 0 };
  const deals = await ladeUpsellDeals(jetzt);
  let aufgaben = 0;
  for (const d of deals) {
    if (problemVon(d) !== 'kein_schritt' || d.waechterAufgabeOffen) continue;
    await close('/task/', {
      method: 'POST',
      body: JSON.stringify({ lead_id: d.leadId, ...(d.userId ? { assigned_to: d.userId } : {}), text: aufgabenText(d.firma, d.wert), date: jetzt.toISOString().slice(0, 10) }),
    });
    aufgaben++;
  }
  return { deals: deals.length, aufgaben };
}
