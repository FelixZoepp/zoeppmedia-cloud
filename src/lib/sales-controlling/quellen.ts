import type { CloseStatus, MetaZahlen, Opp, StatusEvent } from './compute';
import type { Anruf, Aufgabe } from './detail';

/** Datenquellen für das Sales-Controlling: Close (Pipeline „D2D Sales“) und Meta Ads (Sales-Werbekonto). */

const CLOSE_BASE = 'https://api.close.com/api/v1';
export const CLOSE_PIPELINE_ID = 'pipe_5E14qCHzi8u3cHk0bB44ky';
const LEADQUELLE_FIELD = 'custom.cf_QiH8TTQXCkFg846D3N4qPF6STvbww7q3WJAK3Qja0n8';
const UTM_SOURCE_FIELD = 'custom.cf_HDeEGCeYwUNaYFw1HEYlndsGXBJ8fqcssd1shBPy8xJ';
const META_BASE = 'https://graph.facebook.com/v21.0';
// Kampagnen anderer Produkte ausblenden (wie im Marketing-Report)
const META_FILTER = JSON.stringify([{ field: 'campaign.name', operator: 'NOT_CONTAIN', value: 'KI Outreach Vorlage' }]);

function closeHeaders(): HeadersInit {
  const key = process.env.CLOSE_API_KEY ?? '';
  return { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}

async function closeGet<T>(path: string): Promise<T> {
  const res = await fetch(`${CLOSE_BASE}${path}`, { headers: closeHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${path.split('?')[0]}`);
  return res.json() as Promise<T>;
}

/** Alle Seiten eines Close-Listen-Endpunkts laden */
async function closeAll<T>(path: string, max = 5000): Promise<T[]> {
  const out: T[] = [];
  for (let skip = 0; skip < max; skip += 100) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await closeGet<{ data: T[]; has_more?: boolean }>(`${path}${sep}_limit=100&_skip=${skip}`);
    out.push(...(page.data ?? []));
    if (!page.has_more) break;
  }
  return out;
}

/** Begrenzte Parallelität für viele Einzelabrufe */
async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

type RohStatuswechsel = { opportunity_id: string; old_status_id: string | null; new_status_id: string; date_created: string; user_id: string | null };

/** Statuswechsel der Opportunities – eigener Endpunkt, sonst über die allgemeine Aktivitäten-Liste */
async function ladeStatuswechsel(ab: string): Promise<RohStatuswechsel[]> {
  const felder = '_fields=opportunity_id,old_status_id,new_status_id,date_created,user_id';
  try {
    return await closeAll<RohStatuswechsel>(`/activity/status_change/opportunity/?date_created__gte=${encodeURIComponent(ab)}&${felder}`);
  } catch {
    const alle = await closeAll<RohStatuswechsel & { _type?: string }>(`/activity/?_type=OpportunityStatusChange&date_created__gte=${encodeURIComponent(ab)}&${felder}`);
    return alle.filter((a) => a.opportunity_id && a.new_status_id);
  }
}

export async function ladeClose(historieAb: string, quellenFür: (opps: Opp[]) => Opp[]) {
  const [pipeline, oppsRaw, eventsRaw, usersRaw] = await Promise.all([
    closeGet<{ statuses: CloseStatus[] }>(`/pipeline/${CLOSE_PIPELINE_ID}/`),
    closeAll<{ id: string; lead_id: string; status_id: string; value: number | null; date_created: string; date_won: string | null; user_id: string | null }>(
      `/opportunity/?pipeline_id=${CLOSE_PIPELINE_ID}&_fields=id,lead_id,status_id,value,date_created,date_won,user_id`,
    ),
    ladeStatuswechsel(historieAb),
    closeAll<{ id: string; first_name?: string; last_name?: string; email?: string }>(`/user/?_fields=id,first_name,last_name,email`).catch(() => []),
  ]);

  const statuses = pipeline.statuses ?? [];
  const valid = new Set(statuses.map((s) => s.id));
  const opps: Opp[] = oppsRaw
    .filter((o) => valid.has(o.status_id))
    .map((o) => ({ id: o.id, lead_id: o.lead_id, status_id: o.status_id, value: (o.value ?? 0) / 100, date_created: o.date_created, date_won: o.date_won, user_id: o.user_id }));
  const oppIds = new Set(opps.map((o) => o.id));
  const events: StatusEvent[] = eventsRaw
    .filter((e) => oppIds.has(e.opportunity_id))
    .map((e) => ({ opportunity_id: e.opportunity_id, old_status_id: e.old_status_id, new_status_id: e.new_status_id, date: e.date_created, user_id: e.user_id }));
  const users = new Map(usersRaw.map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || u.id]));

  // Leadquelle nur für die relevanten Deals (Einzelabrufe, max. 150)
  const leadIds = [...new Set(quellenFür(opps).map((o) => o.lead_id))].slice(0, 150);
  const quellen = await inBatches(leadIds, 8, async (id) => {
    try {
      const lead = await closeGet<Record<string, string | null>>(`/lead/${id}/?_fields=id,${LEADQUELLE_FIELD},${UTM_SOURCE_FIELD}`);
      return [id, (lead[LEADQUELLE_FIELD] || lead[UTM_SOURCE_FIELD] || null) as string | null] as const;
    } catch {
      return [id, null] as const;
    }
  });

  return { statuses, opps, events, users, leadQuellen: new Map(quellen) };
}

/** Anrufe (Close-Telefonie) ab Datum – Richtung, Ergebnis und Dauer */
export async function ladeAnrufe(ab: string): Promise<Anruf[]> {
  const roh = await closeAll<{ lead_id: string | null; user_id: string | null; direction: string | null; disposition: string | null; status: string | null; duration: number | null; date_created: string }>(
    `/activity/call/?date_created__gte=${encodeURIComponent(ab)}&_fields=lead_id,user_id,direction,disposition,status,duration,date_created`,
    20000,
  );
  return roh.map((c) => ({ lead_id: c.lead_id, user_id: c.user_id, direction: c.direction, disposition: c.disposition, status: c.status, duration: c.duration, date: c.date_created }));
}

/** Offene Aufgaben (Follow-ups) in Close */
export async function ladeAufgaben(): Promise<Aufgabe[]> {
  return closeAll<Aufgabe>(`/task/?_type=lead&is_complete=false&_fields=lead_id,lead_name,assigned_to,due_date,text`, 5000);
}

interface MetaInsight {
  spend?: string;
  actions?: Array<{ action_type: string; value: string }>;
  date_start?: string;
}

function metaLeads(i: MetaInsight): number {
  const a = (i.actions ?? []).find((x) => x.action_type === 'lead' || x.action_type === 'onsite_conversion.lead_grouped');
  return a ? Number(a.value) : 0;
}

async function metaInsights(params: Record<string, string>): Promise<MetaInsight[]> {
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) return [];
  const url = new URL(`${META_BASE}/${account}/insights`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('level', 'account');
  url.searchParams.set('fields', 'spend,actions');
  url.searchParams.set('filtering', META_FILTER);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Meta ${res.status}`);
  return ((await res.json()) as { data?: MetaInsight[] }).data ?? [];
}

/** Spend + Leads für einen Zeitraum [von, bis) – bis ist exklusiv */
export async function ladeMetaZeitraum(von: string, bis: string): Promise<MetaZahlen | null> {
  const ende = new Date(new Date(bis).getTime() - 864e5).toISOString().slice(0, 10);
  if (ende < von) return { spend: 0, leads: 0 };
  const rows = await metaInsights({ time_range: JSON.stringify({ since: von, until: ende }) });
  if (!process.env.META_ACCESS_TOKEN) return null;
  return rows.reduce((s, r) => ({ spend: s.spend + Number(r.spend ?? 0), leads: s.leads + metaLeads(r) }), { spend: 0, leads: 0 });
}

/** Spend + Leads je Monat (YYYY-MM) */
export async function ladeMetaMonate(von: string, bis: string): Promise<Map<string, MetaZahlen>> {
  const rows = await metaInsights({ time_range: JSON.stringify({ since: von, until: bis }), time_increment: 'monthly' });
  return new Map(rows.map((r) => [String(r.date_start).slice(0, 7), { spend: Number(r.spend ?? 0), leads: metaLeads(r) }]));
}
