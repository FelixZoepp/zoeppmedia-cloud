/**
 * Anzeigen-Auswertung (Sales-Werbekonto): je Anzeige Kosten → Leads → Termine → Abschlüsse.
 * Meta liefert Ausgaben/Reichweite je Anzeige, die Zuordnung Lead → Anzeige kommt aus utm_content
 * (= Anzeigenname, Tabelle lead_herkunft), Termine/Abschlüsse aus den Close-Opportunities der Leads.
 * Nur Auswertung – nichts wird an Meta oder Leads geändert.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { metaAdAccountId, metaAdsToken } from '@/lib/meta/ad-account';
import { META_FILTER, closeAll, CLOSE_PIPELINE_ID } from '@/lib/sales-controlling/quellen';

const CLOSING_STUFEN = new Set([
  'stat_RjrZL3ifb4mKNiPEFFX1IQgse1fbI94R9XZgere2wZT', // Closing – Terminiert
  'stat_mOm4p6MGvO3A6dnmolp5G3l0TWM7v9fOjlJBkaNUlRG', // Closing – No Show
  'stat_qdOAuGHxRx66Mk45E58gOOXnceL04Iouh6nAuoEXyjy', // Closing – Follow Up
  'stat_rfJv0gUGFIaEo2LQc7CkKKjSjabGuE509yRR0gZjozP', // Angebot verschickt
  'stat_TTFBUyYC71TwPVSrEmD0pa0GbqRowRt71e5xI5LFMTN', // CC2 – Terminiert
]);
const GEWONNEN = 'stat_BFVJiIlomolS2JMTSHc49cHnvh2Rl1IuWnudLEYRh0n';

export type AnzeigenStatus = 'gewinner' | 'verlierer' | 'test' | 'ohne_daten';

export interface AnzeigeZeile {
  schluessel: string;
  name: string;
  kampagne: string | null;
  aktiv: boolean;
  ausgaben: number;
  ausgabenGestern: number;
  impressionen: number;
  linkKlicks: number;
  videoViews: number;
  metaLeads: number;
  leads: number;
  termine: number;
  closings: number;
  abschluesse: number;
  umsatz: number;
  cpl: number | null;
  kostenProTermin: number | null;
  kostenProAbschluss: number | null;
  ctr: number | null;
  hookRate: number | null;
  roas: number | null;
  status: AnzeigenStatus;
  grund: string;
  /** Vorschaubild des Creatives (Meta) */
  bild?: string | null;
}

export interface PlattformZeile {
  plattform: string;
  ausgaben: number;
  impressionen: number;
  linkKlicks: number;
  leads: number;
  termine: number;
  abschluesse: number;
  umsatz: number;
  cpl: number | null;
}

const PLATTFORM: Record<string, string> = { fb: 'Facebook', facebook: 'Facebook', ig: 'Instagram', instagram: 'Instagram', an: 'Audience Network', audience_network: 'Audience Network', messenger: 'Messenger', threads: 'Threads' };
export const plattformName = (s: string | null | undefined) => (s ? PLATTFORM[s.toLowerCase()] ?? s : 'Unbekannt');

export const normName = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

interface MetaAnzeigeRoh {
  ad_id: string;
  ad_name: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
  date_start?: string;
}

async function metaAnzeigen(von: string, bis: string, tageweise = false): Promise<MetaAnzeigeRoh[] | null> {
  const token = metaAdsToken();
  const account = metaAdAccountId();
  if (!token || !account) return null;
  const out: MetaAnzeigeRoh[] = [];
  let url: string | null = (() => {
    const u = new URL(`https://graph.facebook.com/v21.0/${account}/insights`);
    u.searchParams.set('access_token', token);
    u.searchParams.set('level', 'ad');
    u.searchParams.set('fields', 'ad_id,ad_name,campaign_name,spend,impressions,inline_link_clicks,actions');
    u.searchParams.set('filtering', META_FILTER);
    u.searchParams.set('time_range', JSON.stringify({ since: von, until: bis }));
    if (tageweise) u.searchParams.set('time_increment', '1');
    u.searchParams.set('limit', '500');
    return u.toString();
  })();
  for (let i = 0; url && i < 10; i++) {
    const res: Response = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Meta ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const d = (await res.json()) as { data?: MetaAnzeigeRoh[]; paging?: { next?: string } };
    out.push(...(d.data ?? []));
    url = d.paging?.next ?? null;
  }
  return out;
}

async function metaGet<T>(pfad: string, params: Record<string, string>): Promise<T[] | null> {
  const token = metaAdsToken();
  const account = metaAdAccountId();
  if (!token || !account) return null;
  const u = new URL(`https://graph.facebook.com/v21.0/${account}/${pfad}`);
  u.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const out: T[] = [];
  let url: string | null = u.toString();
  for (let i = 0; url && i < 5; i++) {
    const res: Response = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Meta ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const d = (await res.json()) as { data?: T[]; paging?: { next?: string } };
    out.push(...(d.data ?? []));
    url = d.paging?.next ?? null;
  }
  return out;
}

const aktion = (r: MetaAnzeigeRoh, typen: string[]) => (r.actions ?? []).filter((a) => typen.includes(a.action_type)).reduce((s, a) => s + Number(a.value), 0);

/** Status je Anzeige (rein, testbar) */
export function bewerte(z: Pick<AnzeigeZeile, 'ausgaben' | 'leads' | 'cpl'>, schnittCpl: number | null): { status: AnzeigenStatus; grund: string } {
  if (z.ausgaben < 1 && z.leads === 0) return { status: 'ohne_daten', grund: 'Keine Ausgaben im Zeitraum' };
  if (schnittCpl === null) return { status: 'test', grund: 'Noch kein Vergleichswert' };
  if (z.leads === 0) {
    return z.ausgaben >= Math.max(2 * schnittCpl, 100)
      ? { status: 'verlierer', grund: `${Math.round(z.ausgaben)} € ohne Lead (Ø ${Math.round(schnittCpl)} € pro Lead)` }
      : { status: 'test', grund: 'Noch zu wenig Budget für eine Aussage' };
  }
  if (z.cpl !== null && z.leads >= 3 && z.cpl <= schnittCpl * 0.8) return { status: 'gewinner', grund: `${Math.round((1 - z.cpl / schnittCpl) * 100)} % günstiger als der Schnitt` };
  if (z.cpl !== null && z.ausgaben >= 100 && z.cpl >= schnittCpl * 1.5) return { status: 'verlierer', grund: `${Math.round((z.cpl / schnittCpl - 1) * 100)} % teurer als der Schnitt` };
  return { status: 'test', grund: z.leads < 3 ? 'Noch zu wenig Leads für eine Aussage' : 'Im Rahmen des Schnitts' };
}

/** Anzeigen-Auswertung für die letzten `tage` Tage (bis gestern + heute) */
export async function ladeAnzeigen(svc: SupabaseClient, tage = 30, jetzt: Date = new Date()): Promise<{ zeilen: AnzeigeZeile[]; plattformen: PlattformZeile[]; summe: Omit<AnzeigeZeile, 'schluessel' | 'name' | 'kampagne' | 'aktiv' | 'status' | 'grund'>; schnittCpl: number | null; von: string; bis: string; metaVerbunden: boolean }> {
  const bis = jetzt.toISOString().slice(0, 10);
  const von = new Date(jetzt.getTime() - (tage - 1) * 864e5).toISOString().slice(0, 10);
  const gestern = new Date(jetzt.getTime() - 864e5).toISOString().slice(0, 10);

  const [meta, metaGestern, { data: herkunft }, opps, plattformMeta, creatives] = await Promise.all([
    metaAnzeigen(von, bis).catch((e) => (console.error('[anzeigen] Meta', e), null)),
    metaAnzeigen(gestern, gestern).catch(() => null),
    svc.from('lead_herkunft').select('lead_id, utm_content, utm_campaign, utm_source').gte('eingetragen_am', `${von}T00:00:00Z`),
    closeAll<{ id: string; lead_id: string; status_id: string; value: number | null }>(`/opportunity/?pipeline_id=${CLOSE_PIPELINE_ID}&_fields=id,lead_id,status_id,value`).catch(() => []),
    metaGet<MetaAnzeigeRoh & { publisher_platform: string }>('insights', {
      level: 'account',
      fields: 'spend,impressions,inline_link_clicks,actions',
      breakdowns: 'publisher_platform',
      filtering: META_FILTER,
      time_range: JSON.stringify({ since: von, until: bis }),
    }).catch(() => null),
    metaGet<{ id: string; name: string; creative?: { thumbnail_url?: string; image_url?: string } }>('ads', { fields: 'id,name,creative{thumbnail_url,image_url}', limit: '200' }).catch(() => null),
  ]);

  const proLead = new Map<string, { termin: boolean; closing: boolean; won: number; abschluss: boolean }>();
  for (const o of opps) {
    const x = proLead.get(o.lead_id) ?? { termin: false, closing: false, won: 0, abschluss: false };
    x.termin = true;
    if (CLOSING_STUFEN.has(o.status_id) || o.status_id === GEWONNEN) x.closing = true;
    if (o.status_id === GEWONNEN) {
      x.abschluss = true;
      x.won += (o.value ?? 0) / 100;
    }
    proLead.set(o.lead_id, x);
  }

  const zeilen = new Map<string, AnzeigeZeile>();
  const leer = (schluessel: string, name: string, kampagne: string | null): AnzeigeZeile => ({
    schluessel, name, kampagne, aktiv: false, ausgaben: 0, ausgabenGestern: 0, impressionen: 0, linkKlicks: 0, videoViews: 0, metaLeads: 0, leads: 0, termine: 0, closings: 0, abschluesse: 0, umsatz: 0,
    cpl: null, kostenProTermin: null, kostenProAbschluss: null, ctr: null, hookRate: null, roas: null, status: 'test', grund: '',
  });
  for (const r of meta ?? []) {
    const k = normName(r.ad_name) || r.ad_id;
    const z = zeilen.get(k) ?? leer(k, r.ad_name, r.campaign_name ?? null);
    z.ausgaben += Number(r.spend ?? 0);
    z.impressionen += Number(r.impressions ?? 0);
    z.linkKlicks += Number(r.inline_link_clicks ?? 0);
    z.videoViews += aktion(r, ['video_view']);
    z.metaLeads += aktion(r, ['lead', 'onsite_conversion.lead_grouped']);
    zeilen.set(k, z);
  }
  for (const r of metaGestern ?? []) {
    const z = zeilen.get(normName(r.ad_name) || r.ad_id);
    if (z) {
      z.ausgabenGestern += Number(r.spend ?? 0);
      z.aktiv = z.ausgabenGestern > 0;
    }
  }
  for (const h of (herkunft ?? []) as Array<{ lead_id: string; utm_content: string | null }>) {
    const k = normName(h.utm_content) || 'ohne_zuordnung';
    const z = zeilen.get(k) ?? leer(k, h.utm_content ?? 'Ohne Anzeigen-Zuordnung', null);
    z.leads++;
    const l = proLead.get(h.lead_id);
    if (l?.termin) z.termine++;
    if (l?.closing) z.closings++;
    if (l?.abschluss) {
      z.abschluesse++;
      z.umsatz += l.won;
    }
    zeilen.set(k, z);
  }

  const teilen = (a: number, b: number) => (b > 0 ? a / b : null);

  // Plattformen: Ausgaben laut Meta, Leads/Termine/Abschlüsse laut utm_source
  const plattformen = new Map<string, PlattformZeile>();
  const pz = (name: string) => plattformen.get(name) ?? { plattform: name, ausgaben: 0, impressionen: 0, linkKlicks: 0, leads: 0, termine: 0, abschluesse: 0, umsatz: 0, cpl: null };
  for (const r of plattformMeta ?? []) {
    const p = pz(plattformName(r.publisher_platform));
    p.ausgaben += Number(r.spend ?? 0);
    p.impressionen += Number(r.impressions ?? 0);
    p.linkKlicks += Number(r.inline_link_clicks ?? 0);
    plattformen.set(p.plattform, p);
  }
  for (const h of (herkunft ?? []) as Array<{ lead_id: string; utm_source: string | null }>) {
    const p = pz(plattformName(h.utm_source));
    p.leads++;
    const l = proLead.get(h.lead_id);
    if (l?.termin) p.termine++;
    if (l?.abschluss) {
      p.abschluesse++;
      p.umsatz += l.won;
    }
    plattformen.set(p.plattform, p);
  }
  for (const p of plattformen.values()) p.cpl = teilen(p.ausgaben, p.leads);

  // Vorschaubilder der Creatives
  const bilder = new Map((creatives ?? []).map((c) => [normName(c.name), c.creative?.thumbnail_url ?? c.creative?.image_url ?? null]));
  for (const z of zeilen.values()) z.bild = bilder.get(z.schluessel) ?? null;

  const alle = [...zeilen.values()];
  for (const z of alle) {
    // Leads: Funnel-Eintragungen (zugeordnet), sonst Meta-Leads (Lead-Formulare)
    if (z.leads === 0 && z.metaLeads > 0) z.leads = z.metaLeads;
    z.cpl = teilen(z.ausgaben, z.leads);
    z.kostenProTermin = teilen(z.ausgaben, z.termine);
    z.kostenProAbschluss = teilen(z.ausgaben, z.abschluesse);
    z.ctr = teilen(z.linkKlicks * 100, z.impressionen);
    z.hookRate = teilen(z.videoViews * 100, z.impressionen);
    z.roas = teilen(z.umsatz, z.ausgaben);
  }
  const gesamtAusgaben = alle.reduce((s, z) => s + z.ausgaben, 0);
  const gesamtLeads = alle.filter((z) => z.ausgaben > 0).reduce((s, z) => s + z.leads, 0);
  const schnittCpl = gesamtLeads >= 3 ? gesamtAusgaben / gesamtLeads : null;
  for (const z of alle) Object.assign(z, bewerte(z, schnittCpl));

  const summe = alle.reduce(
    (s, z) => ({ ...s, ausgaben: s.ausgaben + z.ausgaben, ausgabenGestern: s.ausgabenGestern + z.ausgabenGestern, impressionen: s.impressionen + z.impressionen, linkKlicks: s.linkKlicks + z.linkKlicks, videoViews: s.videoViews + z.videoViews, metaLeads: s.metaLeads + z.metaLeads, leads: s.leads + z.leads, termine: s.termine + z.termine, closings: s.closings + z.closings, abschluesse: s.abschluesse + z.abschluesse, umsatz: s.umsatz + z.umsatz }),
    { ausgaben: 0, ausgabenGestern: 0, impressionen: 0, linkKlicks: 0, videoViews: 0, metaLeads: 0, leads: 0, termine: 0, closings: 0, abschluesse: 0, umsatz: 0, cpl: null as number | null, kostenProTermin: null as number | null, kostenProAbschluss: null as number | null, ctr: null as number | null, hookRate: null as number | null, roas: null as number | null },
  );
  summe.cpl = teilen(summe.ausgaben, summe.leads);
  summe.kostenProTermin = teilen(summe.ausgaben, summe.termine);
  summe.kostenProAbschluss = teilen(summe.ausgaben, summe.abschluesse);
  summe.ctr = teilen(summe.linkKlicks * 100, summe.impressionen);
  summe.hookRate = teilen(summe.videoViews * 100, summe.impressionen);
  summe.roas = teilen(summe.umsatz, summe.ausgaben);

  const reihenfolge: Record<AnzeigenStatus, number> = { verlierer: 0, gewinner: 1, test: 2, ohne_daten: 3 };
  return {
    zeilen: alle.sort((a, b) => reihenfolge[a.status] - reihenfolge[b.status] || b.ausgaben - a.ausgaben),
    plattformen: [...plattformen.values()].sort((a, b) => b.ausgaben - a.ausgaben || b.leads - a.leads),
    summe,
    schnittCpl,
    von,
    bis,
    metaVerbunden: meta !== null,
  };
}
