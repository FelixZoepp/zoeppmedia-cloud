/**
 * Meta Conversions API (Server → „D2D Pixel“): meldet echte Ereignisse aus Funnel und Close an Meta,
 * damit die Anzeigen auf gute Leads optimieren statt nur auf Formular-Einträge.
 *  - Lead            jede Eintragung im Vertriebs-Funnel (ergänzt das Browser-Pixel, das 25–40 % verpasst)
 *  - QualifiedLead   Deal geht in „Closing – Terminiert“ (Beratungsgespräch gelegt = qualifiziert)
 *  - Purchase        Deal gewonnen (nur Neukunden aus „D2D Sales“, mit Auftragswert)
 * Kontaktdaten gehen nur SHA-256-gehasht raus (Meta-Vorgabe). Nur mit Freigabe „meta_conversions“ –
 * oder im Testmodus (system_einstellungen.meta_capi_test_code): dann landen die Ereignisse nur unter
 * „Ereignisse testen“ im Events Manager und zählen nicht für die Anzeigen.
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { istFreigegeben } from '@/lib/freigaben';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';

const GRAPH = 'https://graph.facebook.com/v21.0';
/** „D2D Pixel“ im Werbekonto Felix Zoepp (alle aktiven Anzeigengruppen optimieren darauf) */
export const D2D_PIXEL_ID = '1728799155114823';
const CLOSE_BASE = 'https://api.close.com/api/v1';

export type CapiEreignis = 'Lead' | 'QualifiedLead' | 'Purchase';

export interface Kontakt {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  fbclid?: string | null;
  /** erster Besuch im Funnel (ISO) – Zeitstempel für fbc */
  ersterBesuch?: string | null;
}

/* ── rein, testbar ─────────────────────────────────────────────── */

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function normEmail(e: string | null | undefined): string | null {
  const t = (e ?? '').trim().toLowerCase();
  return t.includes('@') ? t : null;
}

/** Nur Ziffern mit Ländervorwahl (DE als Standard): 0176… → 49176…, +43… → 43… */
export function normTelefon(p: string | null | undefined): string | null {
  let d = (p ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `49${d.slice(1)}`;
  return d.length >= 8 ? d : null;
}

export function teileName(name: string | null | undefined): { fn: string | null; ln: string | null } {
  const teile = (name ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!teile.length) return { fn: null, ln: null };
  return { fn: teile[0], ln: teile.length > 1 ? teile[teile.length - 1] : null };
}

/** Klick-ID im Meta-Format fb.1.<ms>.<fbclid> */
export function fbcAus(fbclid: string | null | undefined, ersterBesuch: string | null | undefined, jetzt: Date = new Date()): string | null {
  const id = (fbclid ?? '').trim();
  if (!id) return null;
  const ms = ersterBesuch && !Number.isNaN(Date.parse(ersterBesuch)) ? Date.parse(ersterBesuch) : jetzt.getTime();
  return `fb.1.${ms}.${id}`;
}

export function baueUserData(k: Kontakt, closeLeadId: string | null, fbc: string | null): Record<string, unknown> {
  const em = normEmail(k.email);
  const ph = normTelefon(k.phone);
  const { fn, ln } = teileName(k.name);
  return {
    ...(em ? { em: [sha256(em)] } : {}),
    ...(ph ? { ph: [sha256(ph)] } : {}),
    ...(fn ? { fn: [sha256(fn)] } : {}),
    ...(ln ? { ln: [sha256(ln)] } : {}),
    country: [sha256('de')],
    // Gleiche ID über alle Ereignisse eines Leads → Meta verknüpft Lead, Qualifizierung und Kauf
    ...(closeLeadId ? { external_id: [sha256(closeLeadId)] } : {}),
    ...(fbc ? { fbc } : {}),
  };
}

export function baueEvent(e: { name: CapiEreignis; eventId: string; zeit: Date; userData: Record<string, unknown>; wert?: number | null }) {
  return {
    event_name: e.name,
    event_time: Math.floor(e.zeit.getTime() / 1000),
    event_id: e.eventId,
    action_source: 'system_generated',
    user_data: e.userData,
    custom_data: {
      event_source: 'crm',
      lead_event_source: 'Zoepp Cloud',
      ...(e.name === 'Purchase' ? { currency: 'EUR', value: Math.max(0, e.wert ?? 0) } : {}),
    },
  };
}

/** Fbclid + erster Besuch aus einem Perspective-Payload */
export function klickAusPayload(body: Record<string, unknown>): { fbclid: string | null; ersterBesuch: string | null; konvertiert: string | null } {
  const profile = (body.profile ?? {}) as Record<string, unknown>;
  const roh = profile.fbclid;
  const fbclid = typeof roh === 'string' ? roh : roh && typeof roh === 'object' && typeof (roh as { value?: unknown }).value === 'string' ? (roh as { value: string }).value : null;
  const meta = (body.meta ?? {}) as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === 'string' ? x : null);
  return { fbclid: fbclid || null, ersterBesuch: s(meta.ps_first_seen_at), konvertiert: s(meta.ps_converted_at) };
}

/* ── Planen + Senden ───────────────────────────────────────────── */

async function testCode(svc: SupabaseClient): Promise<string | null> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', 'meta_capi_test_code').maybeSingle();
  const w = ((data as { wert: string } | null)?.wert ?? '').trim().replace(/^"|"$/g, '');
  return w || null;
}

/** Ereignis vormerken (einmal je eventId) und Versand-Job planen. Nie werfen – Webhooks dürfen daran nicht scheitern. */
export async function planeCapiEvent(
  svc: SupabaseClient,
  e: { name: CapiEreignis; eventId: string; closeLeadId: string | null; oppId?: string | null; wert?: number | null; zeit?: Date; kontakt?: Kontakt },
): Promise<'geplant' | 'aus' | 'doppelt'> {
  try {
    const test = await testCode(svc);
    if (!test && !(await istFreigegeben(svc, 'meta_conversions'))) return 'aus';
    const fbc = e.kontakt ? fbcAus(e.kontakt.fbclid, e.kontakt.ersterBesuch) : null;
    const { error } = await svc.from('meta_capi_events').insert({
      event_id: e.eventId,
      event_name: e.name,
      close_lead_id: e.closeLeadId,
      opp_id: e.oppId ?? null,
      wert: e.wert ?? null,
      fbc,
      test: !!test,
      user_data: e.kontakt ? baueUserData(e.kontakt, e.closeLeadId, fbc) : null,
      created_at: (e.zeit ?? new Date()).toISOString(),
    });
    if (error?.code === '23505') return 'doppelt';
    if (error) throw new Error(error.message);
    await svc.from('scheduled_jobs').insert({
      agency_id: SALES_AGENCY_ID,
      type: 'meta.capi',
      run_at: new Date().toISOString(),
      payload: { event_id: e.eventId },
      status: 'pending',
      dedupe_key: `meta.capi:${e.eventId}`,
    });
    return 'geplant';
  } catch (err) {
    console.error('[meta-capi] nicht geplant:', err);
    return 'aus';
  }
}

function closeHeaders(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}` };
}

/** Kontakt + Klick-ID für spätere Ereignisse: aus Close, fbc aus dem Lead-Ereignis bzw. dem Funnel-Eingang */
async function kontaktFuerLead(svc: SupabaseClient, closeLeadId: string): Promise<{ kontakt: Kontakt; fbc: string | null }> {
  const res = await fetch(`${CLOSE_BASE}/lead/${closeLeadId}/?_fields=contacts`, { headers: closeHeaders(), cache: 'no-store' });
  const lead = res.ok ? ((await res.json()) as { contacts?: Array<{ name?: string; emails?: Array<{ email: string }>; phones?: Array<{ phone: string }> }> }) : {};
  const c = lead.contacts?.[0];
  const kontakt: Kontakt = { name: c?.name ?? null, email: c?.emails?.[0]?.email ?? null, phone: c?.phones?.[0]?.phone ?? null };

  const { data: frueher } = await svc.from('meta_capi_events').select('fbc').eq('close_lead_id', closeLeadId).not('fbc', 'is', null).order('created_at', { ascending: false }).limit(1);
  let fbc: string | null = ((frueher ?? []) as Array<{ fbc: string }>)[0]?.fbc ?? null;
  if (!fbc && (kontakt.email || kontakt.phone)) {
    const { leseFunnelLead } = await import('@/lib/sales/funnel-lead');
    const { data } = await svc.from('events_inbox').select('payload').eq('source', 'sales_funnel').order('processed_at', { ascending: false }).limit(400);
    const mail = normEmail(kontakt.email);
    const tel = normTelefon(kontakt.phone);
    for (const row of (data ?? []) as Array<{ payload: Record<string, unknown> }>) {
      const l = leseFunnelLead(row.payload);
      if ((mail && normEmail(l.email) === mail) || (tel && normTelefon(l.phone) === tel)) {
        const k = klickAusPayload(row.payload);
        fbc = fbcAus(k.fbclid, k.ersterBesuch);
        if (fbc) break;
      }
    }
  }
  return { kontakt, fbc };
}

/** Job meta.capi */
export async function sendeCapiEvent(svc: SupabaseClient, eventId: string): Promise<string> {
  const { data } = await svc.from('meta_capi_events').select('*').eq('event_id', eventId).maybeSingle();
  const row = data as {
    event_id: string; event_name: CapiEreignis; close_lead_id: string | null; wert: number | null; fbc: string | null; test: boolean; status: string; user_data: Record<string, unknown> | null; created_at: string;
  } | null;
  if (!row) return 'unbekannt';
  if (row.status === 'gesendet') return 'schon_gesendet';

  const token = process.env.META_CAPI_TOKEN || process.env.META_SYSTEM_USER_TOKEN;
  const fehler = async (text: string) => {
    await svc.from('meta_capi_events').update({ status: 'fehler', antwort: { fehler: text } }).eq('event_id', eventId);
    return `fehler: ${text}`;
  };
  if (!token) return fehler('META_SYSTEM_USER_TOKEN fehlt');

  let userData = row.user_data;
  let fbc = row.fbc;
  if (!userData) {
    if (!row.close_lead_id) return fehler('kein Lead');
    const k = await kontaktFuerLead(svc, row.close_lead_id);
    fbc = k.fbc;
    userData = baueUserData(k.kontakt, row.close_lead_id, fbc);
  }
  if (!userData.em && !userData.ph && !userData.fbc) {
    await svc.from('meta_capi_events').update({ status: 'uebersprungen', antwort: { grund: 'keine Kontaktdaten' } }).eq('event_id', eventId);
    return 'uebersprungen';
  }

  const test = row.test ? await testCode(svc) : null;
  const pixel = process.env.META_PIXEL_ID || D2D_PIXEL_ID;
  const res = await fetch(`${GRAPH}/${pixel}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [baueEvent({ name: row.event_name, eventId: row.event_id, zeit: new Date(row.created_at), userData, wert: row.wert })],
      ...(test ? { test_event_code: test } : {}),
      access_token: token,
    }),
  });
  const antwort = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return fehler(String((antwort.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`));
  await svc.from('meta_capi_events').update({ status: 'gesendet', gesendet_am: new Date().toISOString(), antwort, user_data: userData, fbc }).eq('event_id', eventId);
  return 'gesendet';
}
