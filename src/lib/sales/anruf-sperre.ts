/**
 * Lead nicht erreicht → automatisch 1 Tag gesperrt, auch ohne Gesprächsprotokoll.
 * Close-Webhook activity.call (created/updated) → Job sales.anruf_sperre (3 Min. später, wenn der Anruf beendet ist).
 * „Nicht erreicht“ = ausgehender Anruf mit Ausgang ≠ „answered“ (keine Antwort, Mailbox, besetzt …) bzw. ohne Ausgang mit 0 Sek.
 * Eine längere bestehende Sperre (z. B. 3 Monate) wird nie verkürzt. Wurde nach dem Anruf ein Protokoll gespeichert,
 * entscheidet das Protokoll (keine Sperre durch den Anruf).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENCY_ID } from './calendly-chain';

const CLOSE_BASE = 'https://api.close.com/api/v1';
const GESPERRT_BIS = 'cf_ivdENLjTV0OBF9z2It0W5CikYZMBZbE54BgcbINdO9S';
const TAG = 864e5;
const LAUFEND = new Set(['created', 'queued', 'ringing', 'in-progress', 'in_progress']);

export interface CloseAnruf {
  id: string;
  lead_id: string | null;
  direction?: string | null;
  status?: string | null;
  disposition?: string | null;
  duration?: number | null;
  date_created: string;
}

/** Was tun mit diesem Anruf? (rein, testbar) */
export function entscheide(anruf: CloseAnruf, gesperrtBis: string | null, jetzt: Date): { aktion: 'sperren'; bis: string } | { aktion: 'warten' } | { aktion: 'nichts'; grund: string } {
  if (anruf.direction !== 'outbound') return { aktion: 'nichts', grund: 'eingehend' };
  if (anruf.status && LAUFEND.has(anruf.status)) return { aktion: 'warten' };
  const erreicht = anruf.disposition ? anruf.disposition === 'answered' : (anruf.duration ?? 0) > 0;
  if (erreicht) return { aktion: 'nichts', grund: 'erreicht' };
  const bis = new Date(jetzt.getTime() + TAG);
  if (gesperrtBis && new Date(gesperrtBis).getTime() >= bis.getTime()) return { aktion: 'nichts', grund: 'schon_laenger_gesperrt' };
  return { aktion: 'sperren', bis: bis.toISOString() };
}

function headers(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}

async function close<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLOSE_BASE}${path}`, { ...init, headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

/** Webhook: Prüfung 3 Minuten später planen (einmal je Anruf) */
export async function planeAnrufPruefung(svc: SupabaseClient, anrufId: string, versuch = 1): Promise<void> {
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.anruf_sperre',
    run_at: new Date(Date.now() + 3 * 60_000 * versuch).toISOString(),
    payload: { anruf_id: anrufId, versuch },
    status: 'pending',
    dedupe_key: `sales.anruf_sperre:${anrufId}:${versuch}`,
  });
  if (error && error.code !== '23505') throw new Error(`Anruf-Prüfung nicht geplant: ${error.message}`);
}

/** Job sales.anruf_sperre */
export async function pruefeAnruf(svc: SupabaseClient, payload: { anruf_id: string; versuch?: number }, jetzt: Date = new Date()): Promise<string> {
  const anruf = await close<CloseAnruf>(`/activity/call/${payload.anruf_id}/?_fields=id,lead_id,direction,status,disposition,duration,date_created`);
  if (!anruf.lead_id) return 'ohne_lead';
  // Protokoll nach dem Anruf gespeichert → das Protokoll entscheidet
  const { count } = await svc.from('close_protokolle').select('id', { count: 'exact', head: true }).eq('lead_id', anruf.lead_id).gte('datum', anruf.date_created);
  if (count) return 'protokoll_vorhanden';
  const lead = await close<Record<string, unknown>>(`/lead/${anruf.lead_id}/?_fields=id,custom.${GESPERRT_BIS}`);
  const e = entscheide(anruf, (lead[`custom.${GESPERRT_BIS}`] as string | null | undefined) ?? null, jetzt);
  if (e.aktion === 'warten') {
    const versuch = payload.versuch ?? 1;
    if (versuch < 3) await planeAnrufPruefung(svc, anruf.id, versuch + 1);
    return 'laeuft_noch';
  }
  if (e.aktion === 'nichts') return e.grund;
  await close(`/lead/${anruf.lead_id}/`, { method: 'PUT', body: JSON.stringify({ [`custom.${GESPERRT_BIS}`]: e.bis }) });
  return 'gesperrt';
}
