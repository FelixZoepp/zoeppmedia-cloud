/**
 * Wächter für den Bewerber-Eingang (täglich ab 9 Uhr):
 * Laufender Kunde (Phase „continuity“), der in den letzten 60 Tagen Bewerber aus einer Quelle hatte,
 * seit 72 Stunden aber keinen mehr → Alarm an die Admins (Weiterleitung kaputt oder Anzeige pausiert?).
 * Außerdem: offene Abruf-Fehler stündlich nachholen (indeed.nachholen).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { berlinTag } from '@/lib/zeit/berlin';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { alarmAnAdmins } from './alarm';

const QUELLEN: Record<string, string> = { indeed: 'Indeed', meta: 'Meta', perspective: 'Meta (Funnel)' };

export async function planeEingangsJobs(svc: SupabaseClient, jetzt: Date = new Date()): Promise<void> {
  const stunde = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(jetzt));
  const jobs: Array<{ type: string; dedupe: string }> = [{ type: 'indeed.nachholen', dedupe: `indeed.nachholen:${jetzt.toISOString().slice(0, 13)}` }];
  if (stunde >= 9) jobs.push({ type: 'ops.eingangs_waechter', dedupe: `ops.eingangs_waechter:${berlinTag(jetzt)}` });
  for (const j of jobs) {
    const { error } = await svc.from('scheduled_jobs').insert({ agency_id: SALES_AGENCY_ID, type: j.type, run_at: jetzt.toISOString(), payload: {}, status: 'pending', dedupe_key: j.dedupe });
    if (error && error.code !== '23505') console.error('[eingang] nicht geplant:', j.type, error.message);
  }
}

/** Quelle eines Bewerbers vereinheitlichen */
export function quelleVon(source: string | null): string | null {
  const s = (source ?? '').toLowerCase();
  if (s.includes('indeed')) return 'indeed';
  if (s.includes('perspective')) return 'perspective';
  if (s.includes('meta') || s.includes('facebook') || s.includes('instagram')) return 'meta';
  return null;
}

export async function pruefeEingang(svc: SupabaseClient, jetzt: Date = new Date()): Promise<Array<{ kunde: string; quelle: string; letzte: string }>> {
  const { data: ags } = await svc.from('agencies').select('id, name').eq('fulfillment_phase', 'continuity').is('pausiert_grund', null).neq('id', SALES_AGENCY_ID);
  const seit60 = new Date(jetzt.getTime() - 60 * 864e5).toISOString();
  const grenze = jetzt.getTime() - 72 * 3600_000;
  const funde: Array<{ kunde: string; quelle: string; letzte: string }> = [];
  for (const a of (ags ?? []) as Array<{ id: string; name: string }>) {
    const { data: c } = await svc.from('candidates').select('source, created_at').eq('agency_id', a.id).gte('created_at', seit60).is('deleted_at', null);
    const letzte = new Map<string, string>();
    for (const row of (c ?? []) as Array<{ source: string | null; created_at: string }>) {
      const q = quelleVon(row.source);
      if (q && (!letzte.has(q) || row.created_at > letzte.get(q)!)) letzte.set(q, row.created_at);
    }
    for (const [q, t] of letzte) {
      if (new Date(t).getTime() < grenze) funde.push({ kunde: a.name, quelle: QUELLEN[q] ?? q, letzte: t });
    }
  }
  if (funde.length) {
    await alarmAnAdmins(svc, {
      titel: `🔕 Kein Bewerber-Eingang seit 72 h (${funde.length})`,
      text: funde.map((f) => `${f.kunde} – ${f.quelle}, letzter am ${new Date(f.letzte).toLocaleDateString('de-DE')}`).join(' · ') + '. Weiterleitung oder Anzeige prüfen.',
      link: '/innendienst',
    });
  }
  return funde;
}
