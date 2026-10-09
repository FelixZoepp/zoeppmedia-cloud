/**
 * Erfolgs-Anzeige (Innendienst → „Erfolgs-Anzeige“): Kunden, Bewerbungen und Einstellungen der letzten 7 Tage.
 * Standard: Live-Zahlen aus allen Kunden-Clouds. Admins können Gesamtzahlen manuell eintragen
 * (z. B. inkl. Kunden, die noch nicht in der Cloud sind) – system_einstellungen.erfolgs_anzeige_manuell.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';

export const MANUELL_KEY = 'erfolgs_anzeige_manuell';

export interface ErfolgsZahlen {
  kunden: number;
  bewerbungen: number;
  einstellungen: number;
  /** Werktage, auf die sich die 7 Tage verteilen (für „Ø pro Tag“) */
  tage: number;
  proTag: number;
  quote: number | null;
  quelle: 'live' | 'manuell';
  stand: string;
}

export interface ManuelleWerte {
  kunden: number;
  bewerbungen: number;
  einstellungen: number;
  tage?: number;
}

export function berechne(w: ManuelleWerte, quelle: ErfolgsZahlen['quelle'], stand: Date): ErfolgsZahlen {
  const tage = w.tage && w.tage > 0 ? w.tage : 5;
  return {
    kunden: w.kunden,
    bewerbungen: w.bewerbungen,
    einstellungen: w.einstellungen,
    tage,
    proTag: Math.round((w.bewerbungen / tage) * 10) / 10,
    quote: w.bewerbungen ? Math.round((w.einstellungen / w.bewerbungen) * 1000) / 10 : null,
    quelle,
    stand: stand.toISOString(),
  };
}

export function pruefeWerte(b: unknown): ManuelleWerte | null {
  const o = (b ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  const kunden = n(o.kunden);
  const bewerbungen = n(o.bewerbungen);
  const einstellungen = n(o.einstellungen);
  const tage = o.tage === undefined ? 5 : n(o.tage);
  if (kunden === null || bewerbungen === null || einstellungen === null || !tage || tage > 7) return null;
  return { kunden, bewerbungen, einstellungen, tage };
}

export async function ladeErfolg(svc: SupabaseClient, jetzt: Date = new Date()): Promise<ErfolgsZahlen> {
  const { data: m } = await svc.from('system_einstellungen').select('wert').eq('key', MANUELL_KEY).maybeSingle();
  const manuell = m ? pruefeWerte(typeof (m as { wert: unknown }).wert === 'string' ? JSON.parse((m as { wert: string }).wert) : (m as { wert: unknown }).wert) : null;
  if (manuell) return berechne(manuell, 'manuell', jetzt);

  const seit = new Date(jetzt.getTime() - 7 * 864e5).toISOString();
  const [{ count: kunden, error: kErr }, { count: bew, error: bErr }, { data: stages }] = await Promise.all([
    svc.from('agencies').select('id', { count: 'exact', head: true }).neq('id', SALES_AGENCY_ID).in('fulfillment_phase', ['onboarding', 'setup', 'continuity']),
    svc.from('applications').select('id', { count: 'exact', head: true }).neq('agency_id', SALES_AGENCY_ID).gte('created_at', seit),
    svc.from('pipeline_stages').select('id, name, stage_type'),
  ]);
  if (kErr || bErr) throw new Error(`Zahlen nicht ladbar: ${(kErr ?? bErr)!.message}`);
  // Eingestellt: Status „hired“ oder Phase vom Typ „hired“ (Altdaten: Name „Eingestellt …“), in den letzten 7 Tagen geändert
  const hired = ((stages ?? []) as Array<{ id: string; name: string; stage_type: string | null }>).filter((s) => s.stage_type === 'hired' || /^eingestellt/i.test(s.name)).map((s) => s.id);
  let eq = svc.from('applications').select('id', { count: 'exact', head: true }).neq('agency_id', SALES_AGENCY_ID).gte('updated_at', seit);
  eq = hired.length ? eq.or(`status.eq.hired,stage_id.in.(${hired.join(',')})`) : eq.eq('status', 'hired');
  const { count: einst, error: eErr } = await eq;
  if (eErr) throw new Error(`Einstellungen nicht zählbar: ${eErr.message}`);
  return berechne({ kunden: kunden ?? 0, bewerbungen: bew ?? 0, einstellungen: einst ?? 0, tage: 5 }, 'live', jetzt);
}

export interface KundenZahl {
  id: string;
  name: string;
  logo_url: string | null;
  bewerbungen: number;
  einstellungen: number;
}

/** Je Kunde in der Cloud: Bewerbungen und Einstellungen der letzten 7 Tage (live) */
export async function ladeKundenZahlen(svc: SupabaseClient, jetzt: Date = new Date()): Promise<KundenZahl[]> {
  const seit = new Date(jetzt.getTime() - 7 * 864e5).toISOString();
  const [{ data: ags, error: aErr }, { data: stages }] = await Promise.all([
    svc.from('agencies').select('id, name, settings').neq('id', SALES_AGENCY_ID).in('fulfillment_phase', ['onboarding', 'setup', 'continuity']),
    svc.from('pipeline_stages').select('id, name, stage_type'),
  ]);
  if (aErr) throw new Error(`Kunden nicht ladbar: ${aErr.message}`);
  const hired = new Set(((stages ?? []) as Array<{ id: string; name: string; stage_type: string | null }>).filter((s) => s.stage_type === 'hired' || /^eingestellt/i.test(s.name)).map((s) => s.id));
  const zeilen = new Map<string, KundenZahl>();
  for (const a of (ags ?? []) as Array<{ id: string; name: string; settings: { logo_url?: string } | null }>) {
    zeilen.set(a.id, { id: a.id, name: a.name, logo_url: a.settings?.logo_url ?? null, bewerbungen: 0, einstellungen: 0 });
  }
  // In Portionen, damit auch große Wochen vollständig gezählt werden
  for (let von = 0; von < 50_000; von += 1000) {
    const { data, error } = await svc
      .from('applications')
      .select('agency_id, status, stage_id, created_at, updated_at')
      .in('agency_id', [...zeilen.keys()])
      .or(`created_at.gte.${seit},updated_at.gte.${seit}`)
      .order('id')
      .range(von, von + 999);
    if (error) throw new Error(`Bewerbungen nicht ladbar: ${error.message}`);
    for (const r of (data ?? []) as Array<{ agency_id: string; status: string | null; stage_id: string | null; created_at: string; updated_at: string }>) {
      const z = zeilen.get(r.agency_id);
      if (!z) continue;
      if (r.created_at >= seit) z.bewerbungen++;
      if (r.updated_at >= seit && (r.status === 'hired' || (r.stage_id && hired.has(r.stage_id)))) z.einstellungen++;
    }
    if ((data ?? []).length < 1000) break;
  }
  return [...zeilen.values()].sort((a, b) => b.bewerbungen - a.bewerbungen || b.einstellungen - a.einstellungen);
}
