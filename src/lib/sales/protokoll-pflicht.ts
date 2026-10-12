/**
 * Protokoll-Pflicht: Jedes Gespräch über 60 Sekunden braucht ein Gesprächsprotokoll in Close.
 * Close-Webhook activity.call → Job sales.protokoll_pflicht 20 Min. später:
 * - Protokoll vorhanden → nichts
 * - sonst → Lücke in protokoll_luecken (für Briefing + Auswertung je Mitarbeiter)
 *   und – nur wenn unter /admin/freigaben eingeschaltet – eine Close-Aufgabe „Protokoll fehlt“ für den Mitarbeiter.
 * Kommt das Protokoll später, wird die Lücke geschlossen (protokolle.ts).
 * Keine Nachricht an Leads.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENCY_ID } from './calendly-chain';
import { istFreigegeben } from '@/lib/freigaben';

export const MIN_GESPRAECH_S = 60;
const WARTEZEIT_MIN = 20;

function headers(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}

async function close<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.close.com/api/v1${path}`, { ...init, headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export async function planeProtokollPruefung(svc: SupabaseClient, anrufId: string): Promise<void> {
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.protokoll_pflicht',
    run_at: new Date(Date.now() + WARTEZEIT_MIN * 60_000).toISOString(),
    payload: { anruf_id: anrufId },
    status: 'pending',
    dedupe_key: `sales.protokoll_pflicht:${anrufId}`,
  });
  if (error && error.code !== '23505') throw new Error(`Protokoll-Prüfung nicht geplant: ${error.message}`);
}

interface Anruf {
  id: string;
  lead_id: string | null;
  user_id: string | null;
  user_name?: string | null;
  duration?: number | null;
  date_created: string;
}

/** Braucht dieser Anruf ein Protokoll? (rein, testbar) */
export function brauchtProtokoll(a: Pick<Anruf, 'lead_id' | 'duration'>): boolean {
  return !!a.lead_id && (a.duration ?? 0) >= MIN_GESPRAECH_S;
}

/** Job sales.protokoll_pflicht */
export async function pruefeProtokollPflicht(svc: SupabaseClient, anrufId: string): Promise<string> {
  const a = await close<Anruf>(`/activity/call/${anrufId}/?_fields=id,lead_id,user_id,user_name,duration,date_created`);
  if (!brauchtProtokoll(a)) return 'kein_gespraech';
  // Protokoll kurz vor oder nach dem Anruf (manche schreiben es schon währenddessen)
  const ab = new Date(new Date(a.date_created).getTime() - 10 * 60_000).toISOString();
  const { count } = await svc.from('close_protokolle').select('id', { count: 'exact', head: true }).eq('lead_id', a.lead_id!).gte('datum', ab);
  if (count) return 'protokoll_vorhanden';

  const lead = await close<{ display_name?: string }>(`/lead/${a.lead_id}/?_fields=display_name`).catch(() => ({ display_name: undefined }));
  const { error } = await svc.from('protokoll_luecken').insert({
    call_id: a.id,
    lead_id: a.lead_id,
    lead_name: lead.display_name ?? null,
    user_id: a.user_id,
    user_name: a.user_name ?? null,
    anruf_am: a.date_created,
    dauer_s: a.duration ?? null,
  });
  if (error?.code === '23505') return 'schon_erfasst';
  if (error) throw new Error(error.message);

  if (a.user_id && (await istFreigegeben(svc, 'protokoll_aufgaben'))) {
    const uhr = new Date(a.date_created).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
    await close('/task/', {
      method: 'POST',
      body: JSON.stringify({
        lead_id: a.lead_id,
        assigned_to: a.user_id,
        text: `📝 Protokoll fehlt: Gespräch um ${uhr} Uhr (${Math.round((a.duration ?? 0) / 60)} Min.) – bitte Gesprächsprotokoll ausfüllen`,
        date: new Date().toISOString().slice(0, 10),
      }),
    });
    await svc.from('protokoll_luecken').update({ aufgabe_angelegt: true }).eq('call_id', a.id);
    return 'aufgabe_angelegt';
  }
  return 'luecke_erfasst';
}

/** Protokoll ist da → offene Lücken des Leads schließen */
export async function schliesseLuecken(svc: SupabaseClient, leadId: string): Promise<void> {
  await svc.from('protokoll_luecken').update({ erledigt_am: new Date().toISOString() }).eq('lead_id', leadId).is('erledigt_am', null);
}

/** Offene Lücken je Mitarbeiter in einem Zeitraum (Briefing) */
export async function lueckenJePerson(svc: SupabaseClient, vonIso: string, bisIso: string): Promise<Array<{ name: string; anzahl: number }>> {
  const { data } = await svc.from('protokoll_luecken').select('user_name').is('erledigt_am', null).gte('anruf_am', vonIso).lt('anruf_am', bisIso);
  const m = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ user_name: string | null }>) {
    const n = r.user_name?.split(' ')[0] || 'Unbekannt';
    m.set(n, (m.get(n) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, anzahl]) => ({ name, anzahl })).sort((a, b) => b.anzahl - a.anzahl);
}
