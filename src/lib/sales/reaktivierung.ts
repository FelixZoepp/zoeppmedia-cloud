/**
 * Unqualifizierte Leads nach 3 Monaten zurück in den Leadpool – es kann sich etwas geändert haben.
 * Täglich (Job sales.reaktivierung, ab 6 Uhr Berlin geplant):
 * - Lead im Status „Unqualifiziert“ ohne „Gesperrt bis“ → Sperre = Zeitpunkt der Einstufung + 3 Monate
 * - Sperre abgelaufen → Status „Leadpool“, Sperre leeren, Notiz mit dem damaligen Grund
 * Bad Data und Disqualifiziert bleiben dauerhaft draußen (andere Status).
 * Arbeitet in Portionen; bleibt etwas übrig, plant sich der Job direkt neu.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENCY_ID } from './calendly-chain';
import { berlinTag } from '@/lib/zeit/berlin';

const CLOSE_BASE = 'https://api.close.com/api/v1';
const LEAD_STATUS_UNQUALIFIZIERT = 'stat_rLRfgTDAiphn7YtSgZcMvw8dZcvgJy8Msi35wkSptkx';
const LEAD_STATUS_LEADPOOL = 'stat_sgDNPr29uwT7tMPTxzQKW6DDCjbM2JMZzdX3UpeRGLb';
const GESPERRT_BIS = 'cf_ivdENLjTV0OBF9z2It0W5CikYZMBZbE54BgcbINdO9S';
export const REAKTIVIERUNG_MONATE = 3;
const PORTION = 60;
/** Zeitbudget im Minuten-Tick */
const BUDGET_MS = 35_000;

/** Protokoll-Felder mit dem Grund (Setting „Grund“, Follow-up „Verloren-Grund“, Terminierung „Einwand“) */
const GRUND_FELDER = ['cf_F0RQQriozWIK59wJEZqtRTxUPYNU0QAUXk6cgWla6xX', 'cf_WTlYPdZH1Tf1dvOilHwtQY24z3ilVOqBhcPOeyWL4IN', 'cf_LrfCv9jCiQOAkx4EaBAa3E3rzA5NIfa4CIfWT2rwuhe'];

function headers(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}

async function close<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLOSE_BASE}${path}`, { ...init, headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${init?.method ?? 'GET'} ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export function plusMonate(iso: string, n: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString();
}

/** Was passiert mit einem unqualifizierten Lead? (rein, testbar) */
export function entscheide(gesperrtBis: string | null, eingestuftAm: string, jetzt: Date): { aktion: 'reaktivieren' } | { aktion: 'sperren'; bis: string } | { aktion: 'warten' } {
  const bis = gesperrtBis ?? plusMonate(eingestuftAm, REAKTIVIERUNG_MONATE);
  if (new Date(bis).getTime() <= jetzt.getTime()) return { aktion: 'reaktivieren' };
  return gesperrtBis ? { aktion: 'warten' } : { aktion: 'sperren', bis };
}

/** Tick: einmal täglich ab 6 Uhr planen */
export async function planeReaktivierung(svc: SupabaseClient, jetzt: Date = new Date()): Promise<void> {
  const stunde = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).formatToParts(jetzt).find((x) => x.type === 'hour')?.value ?? 0);
  if (stunde < 6) return;
  const tag = berlinTag(jetzt);
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.reaktivierung',
    run_at: jetzt.toISOString(),
    payload: { tag },
    status: 'pending',
    dedupe_key: `sales.reaktivierung:${tag}`,
  });
  if (error && error.code !== '23505') console.error('[reaktivierung] nicht geplant:', error.message);
}

interface LeadTreffer {
  id: string;
  date_updated?: string;
  [k: string]: unknown;
}

async function unqualifizierteLeads(): Promise<LeadTreffer[]> {
  const out: LeadTreffer[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const res: { data: LeadTreffer[]; cursor: string | null } = await close(`/data/search/`, {
      method: 'POST',
      body: JSON.stringify({
        query: {
          type: 'and',
          queries: [
            { type: 'object_type', object_type: 'lead' },
            {
              type: 'field_condition',
              field: { type: 'regular_field', object_type: 'lead', field_name: 'status_id' },
              condition: { type: 'reference', reference_type: 'status.lead', object_ids: [LEAD_STATUS_UNQUALIFIZIERT] },
            },
          ],
        },
        _fields: { lead: ['id', 'date_updated', `custom.${GESPERRT_BIS}`] },
        _limit: 200,
        ...(cursor ? { cursor } : {}),
      }),
    });
    out.push(...res.data);
    cursor = res.cursor;
    if (!cursor) break;
  }
  return out;
}

/** Wann wurde der Lead auf „Unqualifiziert“ gesetzt? (letzter Statuswechsel, sonst letzte Änderung) */
async function eingestuftAm(lead: LeadTreffer): Promise<string> {
  try {
    const { data } = await close<{ data: Array<{ new_status_id: string; date_created: string }> }>(
      `/activity/status_change/lead/?lead_id=${lead.id}&_fields=new_status_id,date_created&_limit=50`,
    );
    const treffer = data.filter((d) => d.new_status_id === LEAD_STATUS_UNQUALIFIZIERT).sort((a, b) => b.date_created.localeCompare(a.date_created))[0];
    if (treffer) return treffer.date_created;
  } catch {
    /* Fallback unten */
  }
  return lead.date_updated ?? new Date().toISOString();
}

async function grundAus(svc: SupabaseClient, leadId: string): Promise<string | null> {
  const { data } = await svc.from('close_protokolle').select('felder, datum').eq('lead_id', leadId).order('datum', { ascending: false }).limit(5);
  for (const p of (data ?? []) as Array<{ felder: Record<string, string | null> }>) {
    for (const f of GRUND_FELDER) if (p.felder?.[f]) return p.felder[f];
  }
  return null;
}

/** Job sales.reaktivierung */
export async function reaktiviereUnqualifizierte(svc: SupabaseClient, jetzt: Date = new Date()): Promise<{ reaktiviert: number; gesperrt: number; offen: number }> {
  const start = Date.now();
  const leads = await unqualifizierteLeads();
  let reaktiviert = 0;
  let gesperrt = 0;
  let bearbeitet = 0;

  for (const lead of leads) {
    const gesperrtBis = (lead[`custom.${GESPERRT_BIS}`] as string | null | undefined) ?? null;
    // Mit gesetzter, noch laufender Sperre braucht es keinen Abruf
    if (gesperrtBis && new Date(gesperrtBis).getTime() > jetzt.getTime()) continue;
    if (bearbeitet >= PORTION || Date.now() - start > BUDGET_MS) break;
    bearbeitet++;

    const seit = gesperrtBis ? null : await eingestuftAm(lead);
    const e = entscheide(gesperrtBis, seit ?? jetzt.toISOString(), jetzt);
    if (e.aktion === 'sperren') {
      await close(`/lead/${lead.id}/`, { method: 'PUT', body: JSON.stringify({ [`custom.${GESPERRT_BIS}`]: e.bis }) });
      gesperrt++;
    } else if (e.aktion === 'reaktivieren') {
      await close(`/lead/${lead.id}/`, { method: 'PUT', body: JSON.stringify({ status_id: LEAD_STATUS_LEADPOOL, [`custom.${GESPERRT_BIS}`]: null }) });
      const grund = await grundAus(svc, lead.id);
      const datum = seit ? new Date(seit).toLocaleDateString('de-DE') : null;
      await close(`/activity/note/`, {
        method: 'POST',
        body: JSON.stringify({
          lead_id: lead.id,
          note: `♻️ Nach ${REAKTIVIERUNG_MONATE} Monaten aus „Unqualifiziert“ zurück in den Leadpool${datum ? ` (unqualifiziert seit ${datum})` : ''}.${grund ? ` Grund damals: ${grund}.` : ''} Bitte prüfen, ob sich etwas geändert hat.`,
        }),
      }).catch((err) => console.error('[reaktivierung] Notiz fehlgeschlagen:', err));
      reaktiviert++;
    }
  }

  const offen = leads.filter((l) => {
    const g = l[`custom.${GESPERRT_BIS}`] as string | null | undefined;
    return !g || new Date(g).getTime() <= jetzt.getTime();
  }).length - bearbeitet;

  // Rest in der nächsten Minute weiterbearbeiten
  if (offen > 0) {
    await svc.from('scheduled_jobs').insert({
      agency_id: SALES_AGENCY_ID,
      type: 'sales.reaktivierung',
      run_at: new Date(jetzt.getTime() + 60_000).toISOString(),
      payload: { tag: berlinTag(jetzt), fortsetzung: true },
      status: 'pending',
      dedupe_key: `sales.reaktivierung:${jetzt.toISOString()}`,
    });
  }
  return { reaktiviert, gesperrt, offen: Math.max(0, offen) };
}
