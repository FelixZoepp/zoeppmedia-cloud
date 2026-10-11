/**
 * Firmenwissen für den KI-Agenten: Fakten aus dem Onboarding-Briefing des Kunden + freies Wissensfeld
 * (agencies.settings.agent_wissen). Nur diese Fakten darf der Agent Bewerbern nennen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ladeBriefing, type Briefing } from '@/lib/indeed/anzeige';

export function wissenAusBriefing(b: Briefing | null): string[] {
  if (!b) return [];
  const z: string[] = [];
  const add = (label: string, wert: unknown) => {
    if (wert === null || wert === undefined || wert === '' || (Array.isArray(wert) && !wert.length)) return;
    z.push(`${label}: ${Array.isArray(wert) ? wert.join(', ') : String(wert)}`);
  };
  add('Firma', b.firma);
  add('Gesuchte Rolle', b.jobtitel);
  add('Produkt', b.produkt);
  add('Aufgabe', b.aufgabe);
  add('Einsatzgebiet', b.regionen);
  add('Anstellungsart', b.anstellungsart);
  if (b.verdienst_von || b.verdienst_bis) z.push(`Verdienst pro Monat: ${b.verdienst_von ? `ab ${b.verdienst_von} €` : ''}${b.verdienst_von && b.verdienst_bis ? ' ' : ''}${b.verdienst_bis ? `bis ${b.verdienst_bis} €` : ''} (Spanne, keine Garantie)`);
  add('Vergütungsmodell', b.verguetung);
  add('Provision', b.provision);
  add('Einarbeitung', b.einarbeitung);
  add('Karrierestufen', b.karrierestufen);
  add('Firmenwagen ab', b.firmenwagen_ab);
  add('Extras', b.extras);
  if (b.erfahrung_noetig === false) z.push('Erfahrung: nicht nötig, Quereinsteiger willkommen');
  if (b.fuehrerschein_noetig === true) z.push('Führerschein Klasse B: nötig');
  add('Start', b.start);
  add('Was das Unternehmen besonders macht', b.alleinstellung);
  add('Warum Leute bleiben', b.bleibegruende);
  add('Belegbare Zahlen', b.belegbare_zahlen);
  if (b.verbotene_aussagen) z.push(`NICHT sagen/versprechen: ${b.verbotene_aussagen}`);
  return z;
}

export async function ladeFirmenWissen(svc: SupabaseClient, agencyId: string): Promise<string | null> {
  const [briefing, { data: ag }] = await Promise.all([ladeBriefing(svc, agencyId).catch(() => null), svc.from('agencies').select('settings').eq('id', agencyId).maybeSingle()]);
  const frei = ((ag as { settings: Record<string, unknown> | null } | null)?.settings ?? {}).agent_wissen;
  const zeilen = wissenAusBriefing(briefing);
  if (typeof frei === 'string' && frei.trim()) zeilen.push(`Weitere Infos: ${frei.trim().slice(0, 3000)}`);
  return zeilen.length ? zeilen.join('\n') : null;
}
