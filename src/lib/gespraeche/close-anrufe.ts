/**
 * Close-Telefonate mit Aufnahme (Setting-Gespräche) → Fireflies transkribiert → gleiche Analyse wie Zoom-Gespräche
 * → Notiz am Lead. Der Lead steht in client_reference_id („close:<lead>:<call>“), Zuordnung entfällt.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ladeAudioHoch } from './fireflies';

const CLOSE = 'https://api.close.com/api/v1';
/** Kürzere Anrufe (Mailbox, „ruf später an“) lohnen keine Analyse */
export const MIN_SEKUNDEN = 120;

function auth(): string {
  const key = process.env.CLOSE_API_KEY;
  if (!key) throw new Error('CLOSE_API_KEY fehlt');
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

export interface CloseAnruf {
  id: string;
  lead_id: string;
  duration: number | null;
  recording_url: string | null;
  date_created: string;
  direction: string | null;
}

export async function ladeAnrufe(seit: Date): Promise<CloseAnruf[]> {
  const out: CloseAnruf[] = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const p = new URLSearchParams({ date_created__gte: seit.toISOString(), _limit: '100', _skip: String(skip) });
    const res = await fetch(`${CLOSE}/activity/call/?${p}`, { headers: { Authorization: auth() } });
    if (!res.ok) throw new Error(`Close-Anrufe nicht ladbar (${res.status})`);
    const j = (await res.json()) as { data: CloseAnruf[]; has_more?: boolean };
    out.push(...j.data);
    if (!j.has_more) break;
  }
  return out.filter((c) => c.recording_url && (c.duration ?? 0) >= MIN_SEKUNDEN);
}

export async function ladeAnruf(id: string): Promise<CloseAnruf | null> {
  const res = await fetch(`${CLOSE}/activity/call/${id}/`, { headers: { Authorization: auth() } });
  if (!res.ok) return null;
  return (await res.json()) as CloseAnruf;
}

/** Kurzlebiger, öffentlicher Download-Link der Aufnahme (Close leitet auf einen signierten Speicher-Link um) */
async function aufnahmeLink(recordingUrl: string): Promise<string> {
  const res = await fetch(recordingUrl, { headers: { Authorization: auth() }, redirect: 'manual' });
  const ziel = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && ziel) return ziel;
  throw new Error(`Aufnahme-Link nicht verfügbar (${res.status})`);
}

async function leadName(leadId: string): Promise<string> {
  const res = await fetch(`${CLOSE}/lead/${leadId}/?_fields=display_name`, { headers: { Authorization: auth() } });
  return res.ok ? (((await res.json()) as { display_name?: string }).display_name ?? 'Lead') : 'Lead';
}

export const anrufRef = (leadId: string, callId: string) => `close:${leadId}:${callId}`;
export function leadAusRef(ref: unknown): string | null {
  return typeof ref === 'string' ? ref.match(/^close:(lead_[A-Za-z0-9]+):/)?.[1] ?? null : null;
}

/** Einen Anruf an Fireflies geben (je Anruf nur einmal) */
export async function schickeAnruf(svc: SupabaseClient, c: CloseAnruf): Promise<'hochgeladen' | 'schon' | 'fehler'> {
  const { data: schon } = await svc.from('close_anruf_uploads').select('status').eq('call_id', c.id).maybeSingle();
  if ((schon as { status: string } | null)?.status === 'hochgeladen') return 'schon';
  const datum = new Date(c.date_created);
  const titel = `${await leadName(c.lead_id)}: Telefonat ${datum.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}`;
  try {
    await ladeAudioHoch({ url: await aufnahmeLink(c.recording_url!), title: titel, clientRef: anrufRef(c.lead_id, c.id), datum: datum.toISOString() });
    await svc.from('close_anruf_uploads').upsert({ call_id: c.id, lead_id: c.lead_id, titel, dauer_sek: c.duration, status: 'hochgeladen', fehler: null });
    return 'hochgeladen';
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Fehler';
    await svc.from('close_anruf_uploads').upsert({ call_id: c.id, lead_id: c.lead_id, titel, dauer_sek: c.duration, status: 'fehler', fehler: msg.slice(0, 300) });
    return 'fehler';
  }
}
