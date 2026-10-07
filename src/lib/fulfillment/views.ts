import { agencyLogo } from '@/lib/branding/logo';
/**
 * Fulfillment v2 — Lese-Sichten für Board, Kunden-Ablauf und Aufgabenlisten.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { STEP_BY_KEY, PHASES, type Phase } from './catalog';
import { ensureFulfillment, type ClientStepRow } from './engine';

/** Interne Agentur (Sales-WhatsApp), kein Kunde */
export const HIDDEN_AGENCY_IDS = ['2e4140ec-efc5-46db-9746-0ce3c32dc558'];

const OPEN = ['offen', 'in_arbeit', 'zur_pruefung'];

export interface StepView extends ClientStepRow {
  titel: string;
  beschreibung: string | null;
  pruefen: boolean;
  optional: boolean;
  anleitung: { schritte: string[]; pdf_seiten?: string } | null;
  owner_name: string | null;
  ueberfaellig: boolean;
  agency_name?: string;
}

export function today(now: Date = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

export function toStepView(row: ClientStepRow, owners: Map<string, string>, now: Date = new Date()): StepView {
  const def = STEP_BY_KEY.get(row.step_key);
  return {
    ...row,
    titel: def?.titel ?? row.step_key,
    beschreibung: def?.beschreibung ?? null,
    pruefen: !!def?.pruefen,
    optional: !!def?.optional,
    anleitung: def?.anleitung ?? null,
    owner_name: row.owner_user_id ? owners.get(row.owner_user_id) ?? null : null,
    ueberfaellig: OPEN.includes(row.status) && !!row.faellig_am && row.faellig_am < today(now),
  };
}

export async function ownerNames(svc: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await svc.from('users').select('id, name').in('role', ['admin', 'employee']);
  return new Map(((data ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name]));
}

/** Reihenfolge wie im Katalog */
function catalogIndex(key: string): number {
  return [...STEP_BY_KEY.keys()].indexOf(key);
}

export interface BoardClient {
  id: string;
  name: string;
  contact_name: string | null;
  /** Kunden-Logo aus agencies.settings */
  logo_url: string | null;
  phase: Phase;
  tage_in_phase: number;
  pausiert_grund: string | null;
  schritte_gesamt: number;
  schritte_erledigt: number;
  ueberfaellig: number;
  /** Bei wem liegt der älteste offene Schritt? */
  wartet_auf: 'kunde' | 'zoepp' | null;
  naechster_schritt: { titel: string; wer: 'kunde' | 'zoepp'; owner_name: string | null; faellig_am: string | null } | null;
  /** Aktueller Schritt im Phasen-Kanban: erster offener Schritt in Katalog-Reihenfolge */
  aktueller_schritt: {
    id: string; step_key: string; titel: string; wer: 'kunde' | 'zoepp'; status: string;
    owner_name: string | null; faellig_am: string | null; ueberfaellig: boolean;
  } | null;
}

export async function loadBoard(svc: SupabaseClient, agencyIds: string[] | null, now: Date = new Date()): Promise<BoardClient[]> {
  let q = svc
    .from('agencies')
    .select('id, name, contact_name, fulfillment_phase, fulfillment_phase_seit, pausiert_grund, created_at, settings')
    .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`);
  if (agencyIds) q = q.in('id', agencyIds);
  const { data: agencies } = await q;
  const list = (agencies ?? []) as Array<{
    id: string; name: string; contact_name: string | null; fulfillment_phase: Phase | null;
    fulfillment_phase_seit: string | null; pausiert_grund: string | null; created_at: string; settings?: unknown;
  }>;

  // Bestandskunden ohne Phase einmalig übernehmen
  for (const a of list.filter((x) => !x.fulfillment_phase)) {
    a.fulfillment_phase = await ensureFulfillment(svc, a.id, now);
    a.fulfillment_phase_seit = now.toISOString();
  }

  const ids = list.map((a) => a.id);
  const { data: stepRows } = ids.length
    ? await svc.from('client_steps').select('*').in('agency_id', ids)
    : { data: [] };
  const owners = await ownerNames(svc);
  const steps = ((stepRows ?? []) as ClientStepRow[]).map((r) => toStepView(r, owners, now));

  return list.map((a) => {
    const phase = a.fulfillment_phase as Phase;
    const current = steps
      .filter((s) => s.agency_id === a.id && s.phase === phase)
      .sort((x, y) => catalogIndex(x.step_key) - catalogIndex(y.step_key));
    const open = current.filter((s) => OPEN.includes(s.status));
    const next = [...open].sort((x, y) => String(x.faellig_am).localeCompare(String(y.faellig_am)))[0] ?? null;
    const seit = a.fulfillment_phase_seit ?? a.created_at;
    return {
      id: a.id,
      name: a.name,
      contact_name: a.contact_name,
      logo_url: agencyLogo(a.settings),
      phase,
      tage_in_phase: Math.max(0, Math.floor((now.getTime() - new Date(seit).getTime()) / 86_400_000)),
      pausiert_grund: a.pausiert_grund,
      schritte_gesamt: current.length,
      schritte_erledigt: current.length - open.length,
      ueberfaellig: open.filter((s) => s.ueberfaellig).length,
      wartet_auf: next ? (next.status === 'zur_pruefung' ? 'zoepp' : next.wer) : null,
      naechster_schritt: next
        ? { titel: next.titel, wer: next.wer, owner_name: next.owner_name, faellig_am: next.faellig_am }
        : null,
      aktueller_schritt: open[0]
        ? {
            id: open[0].id, step_key: open[0].step_key, titel: open[0].titel, wer: open[0].wer, status: open[0].status,
            owner_name: open[0].owner_name, faellig_am: open[0].faellig_am, ueberfaellig: open[0].ueberfaellig,
          }
        : null,
    };
  });
}

export async function loadAgencySteps(svc: SupabaseClient, agencyId: string, now: Date = new Date()) {
  const phase = await ensureFulfillment(svc, agencyId, now);
  const [{ data: agency }, { data: rows }, owners, { data: verzoegerungen }] = await Promise.all([
    svc.from('agencies').select('id, name, contact_name, fulfillment_phase, fulfillment_phase_seit, launch_datum, pausiert_grund').eq('id', agencyId).maybeSingle(),
    svc.from('client_steps').select('*').eq('agency_id', agencyId),
    ownerNames(svc),
    svc.from('start_verzoegerungen').select('id, tage, wer, grund, created_at').eq('agency_id', agencyId).order('created_at'),
  ]);
  const steps = ((rows ?? []) as ClientStepRow[])
    .map((r) => toStepView(r, owners, now))
    .sort((x, y) => catalogIndex(x.step_key) - catalogIndex(y.step_key));
  return {
    agency,
    phase,
    team: [...owners.entries()].map(([id, name]) => ({ id, name })),
    verzoegerungen: verzoegerungen ?? [],
    phases: PHASES.map((p) => ({ ...p, schritte: steps.filter((s) => s.phase === p.key) })),
  };
}

/** "Meine Aufgaben" intern: eigene offene Schritte + Kunden-Schritte, die ich prüfen muss. */
export async function loadMyTodos(svc: SupabaseClient, userId: string, now: Date = new Date()): Promise<StepView[]> {
  const { data: rows } = await svc
    .from('client_steps')
    .select('*')
    .eq('owner_user_id', userId)
    .in('status', OPEN);
  const list = ((rows ?? []) as ClientStepRow[]).filter((r) => r.wer === 'zoepp' || r.status === 'zur_pruefung');
  if (!list.length) return [];
  const agencyIds = [...new Set(list.map((r) => r.agency_id))];
  const [{ data: agencies }, owners] = await Promise.all([
    svc.from('agencies').select('id, name, fulfillment_phase').in('id', agencyIds),
    ownerNames(svc),
  ]);
  const meta = new Map(((agencies ?? []) as Array<{ id: string; name: string; fulfillment_phase: Phase }>).map((a) => [a.id, a]));
  return list
    // nur Schritte der aktuellen Phase des Kunden
    .filter((r) => meta.get(r.agency_id)?.fulfillment_phase === r.phase)
    .map((r) => ({ ...toStepView(r, owners, now), agency_name: meta.get(r.agency_id)?.name }))
    .sort((x, y) => String(x.faellig_am).localeCompare(String(y.faellig_am)));
}

/** "Deine Aufgaben" im Kundenportal: Kunden-Schritte der aktuellen Phase (+ erledigte zur Übersicht). */
export async function loadCustomerTasks(svc: SupabaseClient, agencyId: string, now: Date = new Date()) {
  const phase = await ensureFulfillment(svc, agencyId, now);
  const { data: rows } = await svc.from('client_steps').select('*').eq('agency_id', agencyId).eq('wer', 'kunde');
  const owners = await ownerNames(svc);
  const steps = ((rows ?? []) as ClientStepRow[])
    .map((r) => toStepView(r, owners, now))
    .sort((x, y) => catalogIndex(x.step_key) - catalogIndex(y.step_key));
  return {
    phase,
    // Ads-Freigabe läuft über die Freigabe-Karten (Signal ads_freigegeben), nicht über „Erledigt“
    offen: steps.filter((s) => s.phase === phase && (s.status === 'offen' || s.status === 'in_arbeit') && s.step_key !== 's_freigabe'),
    in_pruefung: steps.filter((s) => s.status === 'zur_pruefung'),
    erledigt: steps.filter((s) => s.status === 'erledigt'),
  };
}
