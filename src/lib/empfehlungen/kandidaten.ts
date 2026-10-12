/**
 * Empfehlungen & Erfolgsgeschichten: Kunden mit Zufriedenheit ≥ 8/10 und guten Ergebnissen
 * (≥ 1 Einstellung oder ≥ 10 Bewerber in 30 Tagen) sind Kandidaten für Empfehlung, Video-Testimonial und Bewertung.
 * Stand je Kunde und Art in Tabelle empfehlungen. Angefragt wird per Anruf durch den Kundenbetreuer –
 * nie automatisch per Nachricht. Aufgaben für den Betreuer nur mit Freigabe „empfehlung_aufgaben“.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ladeErgebnisse } from '@/lib/kunden-cloud/ergebnisse';
import { zufriedenheit, UPSELL_MIN_ZUFRIEDENHEIT } from '@/lib/sales/kunden-sync';
import { istFreigegeben } from '@/lib/freigaben';

export type EmpfehlungsArt = 'empfehlung' | 'video' | 'bewertung';
export type EmpfehlungsStatus = 'vorgeschlagen' | 'angefragt' | 'zugesagt' | 'erhalten' | 'abgelehnt';
export const ARTEN: EmpfehlungsArt[] = ['empfehlung', 'video', 'bewertung'];

export interface Kandidat {
  agency_id: string;
  name: string;
  csm_user_id: string | null;
  zufriedenheit: number | null;
  bewerber30: number;
  einstellungen30: number;
  roi: number | null;
  kandidat: boolean;
  grund: string;
  stand: Partial<Record<EmpfehlungsArt, { status: EmpfehlungsStatus; notiz: string | null; empfohlen_name: string | null; updated_at: string }>>;
}

/** Ist der Kunde ein Kandidat? (rein, testbar) */
export function istKandidat(z: number | null, e: { einstellungen30: number; bewerber30: number }, pausiert: boolean): { ja: boolean; grund: string } {
  if (pausiert) return { ja: false, grund: 'pausiert' };
  if (z === null) return { ja: false, grund: 'noch keine Zufriedenheitsumfrage' };
  if (z < UPSELL_MIN_ZUFRIEDENHEIT) return { ja: false, grund: `Zufriedenheit ${z}/10` };
  if (e.einstellungen30 < 1 && e.bewerber30 < 10) return { ja: false, grund: 'Ergebnisse noch zu schwach' };
  return { ja: true, grund: `⭐ ${z}/10 · ${e.einstellungen30} Einstellungen · ${e.bewerber30} Bewerber in 30 Tagen` };
}

export async function ladeKandidaten(svc: SupabaseClient, jetzt: Date = new Date()): Promise<Kandidat[]> {
  const [ergebnisse, { data: umfragen }, { data: stand }] = await Promise.all([
    ladeErgebnisse(svc, jetzt),
    svc.from('survey_responses').select('agency_id, rating, answers, created_at').order('created_at', { ascending: false }).limit(2000),
    svc.from('empfehlungen').select('agency_id, art, status, notiz, empfohlen_name, updated_at'),
  ]);
  const proKunde = new Map<string, Array<{ rating: number | null; answers: Record<string, unknown> | null }>>();
  for (const u of (umfragen ?? []) as Array<{ agency_id: string; rating: number | null; answers: Record<string, unknown> | null }>) {
    const l = proKunde.get(u.agency_id) ?? [];
    if (l.length < 2) l.push(u);
    proKunde.set(u.agency_id, l);
  }
  const standMap = new Map<string, Kandidat['stand']>();
  for (const s of (stand ?? []) as Array<{ agency_id: string; art: EmpfehlungsArt; status: EmpfehlungsStatus; notiz: string | null; empfohlen_name: string | null; updated_at: string }>) {
    standMap.set(s.agency_id, { ...(standMap.get(s.agency_id) ?? {}), [s.art]: { status: s.status, notiz: s.notiz, empfohlen_name: s.empfohlen_name, updated_at: s.updated_at } });
  }
  return ergebnisse
    .map((e) => {
      const z = zufriedenheit(proKunde.get(e.id) ?? []);
      const k = istKandidat(z, e, e.pausiert);
      return {
        agency_id: e.id,
        name: e.name,
        csm_user_id: e.csm_user_id,
        zufriedenheit: z,
        bewerber30: e.bewerber30,
        einstellungen30: e.einstellungen30,
        roi: e.roi,
        kandidat: k.ja,
        grund: k.grund,
        stand: standMap.get(e.id) ?? {},
      };
    })
    .filter((k) => k.kandidat || Object.keys(k.stand).length)
    .sort((a, b) => Number(b.kandidat) - Number(a.kandidat) || (b.zufriedenheit ?? 0) - (a.zufriedenheit ?? 0));
}

/** Täglich (nur mit Freigabe): neue Kandidaten → Aufgabe für den Kundenbetreuer „Empfehlung & Video anfragen“ */
export async function planeEmpfehlungsAufgaben(svc: SupabaseClient, heute: string): Promise<{ angelegt: number }> {
  if (!(await istFreigegeben(svc, 'empfehlung_aufgaben'))) return { angelegt: 0 };
  const kandidaten = (await ladeKandidaten(svc)).filter((k) => k.kandidat && !k.stand.empfehlung);
  let angelegt = 0;
  for (const k of kandidaten) {
    const { error } = await svc.from('empfehlungen').insert({ agency_id: k.agency_id, art: 'empfehlung', status: 'vorgeschlagen' });
    if (error) continue; // schon vorhanden
    await svc.from('internal_tasks').insert({
      title: `🌟 Empfehlung & Video anfragen: ${k.name}`,
      description: `${k.grund}.\nKunde anrufen: Wen kennst du, dem das auch hilft? Hättest du Lust auf ein kurzes Video zu deinen Ergebnissen? Stand eintragen unter /admin/empfehlungen`,
      agency_id: k.agency_id,
      assigned_to: k.csm_user_id,
      status: 'todo',
      priority: 'medium',
      due_date: heute,
      quelle: 'empfehlung',
      quelle_ref: `empf:${k.agency_id}`,
    });
    angelegt++;
  }
  return { angelegt };
}
