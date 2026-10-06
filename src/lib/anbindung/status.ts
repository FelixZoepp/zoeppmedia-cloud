import type { SupabaseClient } from '@supabase/supabase-js';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';
import { agencyLogo } from '@/lib/branding/logo';

/** Bewerber-Anbindung je Kunde: Kommen über Meta/Funnel und Indeed Bewerber an? Ist das Werbekonto hinterlegt? */

export type KanalStatus = 'aktiv' | 'eingerichtet' | 'fehlt';

export interface KundeAnbindung {
  id: string;
  name: string;
  logo_url: string | null;
  phase: string | null;
  pausiert: boolean;
  meta: { status: KanalStatus; letzter: string | null; anzahl14: number; funnel: boolean };
  indeed: { status: KanalStatus; letzter: string | null; anzahl14: number };
  werbekonto: { status: KanalStatus; id: string | null; letzterReport: string | null };
  whatsapp: KanalStatus;
  jobsAktiv: number;
  bewerber14: number;
  offen: string[];
}

type K = { agency_id: string; source: string | null; created_at: string };

export function berechneAnbindung(
  agencies: Array<{ id: string; name: string; settings: unknown; fulfillment_phase: string | null; pausiert_grund: string | null; meta_ad_account_id: string | null }>,
  kandidaten: K[],
  funnels: Array<{ agency_id: string; perspective_funnel_id: string | null }>,
  metaQuellen: string[],
  reports: Array<{ agency_id: string; date: string }>,
  wa: Array<{ agency_id: string; status: string | null }>,
  jobs: Array<{ agency_id: string; status: string | null }>,
  jetzt: Date,
): KundeAnbindung[] {
  const vor14 = new Date(jetzt.getTime() - 14 * 864e5).toISOString();
  const letzter = (xs: K[]) => xs.map((x) => x.created_at).sort().pop() ?? null;

  return agencies.map((a) => {
    const k = kandidaten.filter((x) => x.agency_id === a.id);
    // Funnel-/Perspective-Leads kommen mit source 'meta' an
    const meta = k.filter((x) => x.source === 'meta' || x.source === 'form');
    const indeed = k.filter((x) => x.source === 'indeed');
    const funnel = funnels.some((f) => f.agency_id === a.id && f.perspective_funnel_id);
    const metaEingerichtet = funnel || metaQuellen.includes(a.id);
    const metaStatus: KanalStatus = meta.some((x) => x.created_at >= vor14) ? 'aktiv' : metaEingerichtet || meta.length ? 'eingerichtet' : 'fehlt';
    const indeedStatus: KanalStatus = indeed.some((x) => x.created_at >= vor14) ? 'aktiv' : indeed.length ? 'eingerichtet' : 'fehlt';
    const rep = reports.filter((r) => r.agency_id === a.id).map((r) => r.date).sort().pop() ?? null;
    const werbekonto: KanalStatus = a.meta_ad_account_id ? (rep ? 'aktiv' : 'eingerichtet') : 'fehlt';
    const waStatus = wa.find((w) => w.agency_id === a.id)?.status;
    const whatsapp: KanalStatus = waStatus === 'connected' ? 'aktiv' : waStatus ? 'eingerichtet' : 'fehlt';
    const jobsAktiv = jobs.filter((j) => j.agency_id === a.id && j.status === 'active').length;

    const offen: string[] = [];
    if (metaStatus === 'fehlt') offen.push('Meta-Leads/Funnel anbinden');
    if (indeedStatus === 'fehlt') offen.push('Indeed-Weiterleitung einrichten');
    if (werbekonto === 'fehlt') offen.push('Meta-Werbekonto-ID hinterlegen');
    if (jobsAktiv === 0) offen.push('Aktive Stelle anlegen');

    return {
      id: a.id,
      name: a.name,
      logo_url: agencyLogo(a.settings),
      phase: a.fulfillment_phase,
      pausiert: !!a.pausiert_grund,
      meta: { status: metaStatus, letzter: letzter(meta), anzahl14: meta.filter((x) => x.created_at >= vor14).length, funnel },
      indeed: { status: indeedStatus, letzter: letzter(indeed), anzahl14: indeed.filter((x) => x.created_at >= vor14).length },
      werbekonto: { status: werbekonto, id: a.meta_ad_account_id, letzterReport: rep },
      whatsapp,
      jobsAktiv,
      bewerber14: k.filter((x) => x.created_at >= vor14).length,
      offen,
    };
  }).sort((x, y) => y.offen.length - x.offen.length || x.name.localeCompare(y.name, 'de'));
}

export async function ladeAnbindung(svc: SupabaseClient, jetzt: Date = new Date()): Promise<KundeAnbindung[]> {
  const nicht = `(${HIDDEN_AGENCY_IDS.join(',')})`;
  const [{ data: ags }, { data: kand }, { data: funnels }, { data: quellen }, { data: reports }, { data: wa }, { data: jobs }] = await Promise.all([
    svc.from('agencies').select('id, name, settings, fulfillment_phase, pausiert_grund, meta_ad_account_id').not('id', 'in', nicht).order('name'),
    svc.from('candidates').select('agency_id, source, created_at').is('deleted_at', null).not('agency_id', 'in', nicht).limit(50000),
    svc.from('perspective_funnels').select('agency_id, perspective_funnel_id'),
    svc.from('lead_sources').select('agency_id').eq('kind', 'meta').eq('active', true),
    svc.from('meta_ad_reports').select('agency_id, date:report_date').order('report_date', { ascending: false }).limit(5000),
    svc.from('whatsapp_accounts').select('agency_id, status'),
    svc.from('jobs').select('agency_id, status'),
  ]);
  return berechneAnbindung(
    ((ags ?? []) as Parameters<typeof berechneAnbindung>[0]).filter((a) => a.fulfillment_phase !== 'beendet'),
    (kand ?? []) as K[],
    (funnels ?? []) as Array<{ agency_id: string; perspective_funnel_id: string | null }>,
    ((quellen ?? []) as Array<{ agency_id: string }>).map((q) => q.agency_id),
    (reports ?? []) as Array<{ agency_id: string; date: string }>,
    (wa ?? []) as Array<{ agency_id: string; status: string | null }>,
    (jobs ?? []) as Array<{ agency_id: string; status: string | null }>,
    jetzt,
  );
}
