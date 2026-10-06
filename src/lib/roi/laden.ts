import type { SupabaseClient } from '@supabase/supabase-js';
import { berechneRoi, monatPlus, monatVon, type Einstellung, type UmsatzEintrag } from './berechnung';

/** Bewerber, die als eingestellt gelten: eingestellt_am gesetzt oder in einer Stufe „eingestellt“ */
export async function ladeEinstellungen(svc: SupabaseClient, agencyId: string): Promise<Einstellung[]> {
  const { data: stufen } = await svc
    .from('pipeline_stages')
    .select('id, name, stage_type, agency_id')
    .or(`agency_id.eq.${agencyId},agency_id.is.null`);
  const hiredIds = ((stufen ?? []) as Array<{ id: string; name: string; stage_type: string | null }>)
    .filter((s) => s.stage_type === 'hired' || /^eingestellt/i.test(s.name))
    .map((s) => s.id);

  let q = svc.from('candidates').select('id, name, eingestellt_am, current_stage_id, created_at').eq('agency_id', agencyId).is('deleted_at', null);
  q = hiredIds.length ? q.or(`eingestellt_am.not.is.null,current_stage_id.in.(${hiredIds.join(',')})`) : q.not('eingestellt_am', 'is', null);
  const { data } = await q.order('name');
  const kandidaten = (data ?? []) as Array<{ id: string; name: string; eingestellt_am: string | null; current_stage_id: string | null; created_at: string }>;

  // Ohne eingestellt_am: Zeitpunkt des Wechsels in die Einstellungs-Stufe
  const ohneDatum = kandidaten.filter((k) => !k.eingestellt_am).map((k) => k.id);
  const wechsel = new Map<string, string>();
  if (ohneDatum.length && hiredIds.length) {
    const { data: st } = await svc.from('candidate_stages').select('candidate_id, changed_at').in('candidate_id', ohneDatum).in('stage_id', hiredIds);
    for (const s of (st ?? []) as Array<{ candidate_id: string; changed_at: string }>) {
      if (!wechsel.has(s.candidate_id) || s.changed_at > wechsel.get(s.candidate_id)!) wechsel.set(s.candidate_id, s.changed_at);
    }
  }
  return kandidaten.map((k) => ({ id: k.id, name: k.name, eingestellt_am: k.eingestellt_am ?? wechsel.get(k.id) ?? k.created_at }));
}

export async function ladeKosten(svc: SupabaseClient, agencyId: string) {
  const { data } = await svc.from('agencies').select('mrr, werbebudget, vertragsstart, launch_datum, created_at, paket').eq('id', agencyId).maybeSingle();
  const a = data as { mrr: number | string | null; werbebudget: number | string | null; vertragsstart: string | null; launch_datum: string | null; created_at: string; paket: string | null } | null;
  if (!a) return { mrr: null, werbebudget: null, start: null };
  let mrr = a.mrr !== null ? Number(a.mrr) : null;
  // Kein MRR hinterlegt → Retainer des gebuchten Pakets
  if (!mrr && a.paket) {
    const { data: p } = await svc.from('paket_definitionen').select('retainer_netto').ilike('key', a.paket.trim()).maybeSingle();
    const r = Number((p as { retainer_netto: number | string } | null)?.retainer_netto ?? 0);
    if (r > 0) mrr = r;
  }
  return {
    mrr,
    werbebudget: a.werbebudget !== null ? Number(a.werbebudget) : null,
    start: a.vertragsstart ?? a.launch_datum ?? a.created_at.slice(0, 10),
  };
}

export async function ladeUmsaetze(svc: SupabaseClient, agencyId: string): Promise<UmsatzEintrag[]> {
  const { data } = await svc.from('vertriebler_umsaetze').select('candidate_id, monat, umsatz, provision, aktiv').eq('agency_id', agencyId).order('monat');
  return ((data ?? []) as Array<{ candidate_id: string; monat: string; umsatz: number | string; provision: number | string | null; aktiv: boolean }>).map((x) => ({
    candidate_id: x.candidate_id,
    monat: x.monat.slice(0, 10),
    umsatz: Number(x.umsatz),
    provision: x.provision === null ? null : Number(x.provision),
    aktiv: x.aktiv,
  }));
}

/** Kommende Vorstellungsgespräche und Probetage (beide Termin-Modelle) */
export async function ladeGeplanteTermine(svc: SupabaseClient, agencyId: string, jetzt: Date = new Date()) {
  const ab = jetzt.toISOString();
  const [{ data: alt }, { data: neu }] = await Promise.all([
    svc.from('candidate_appointments').select('type, scheduled_at, status').eq('agency_id', agencyId).gte('scheduled_at', ab),
    svc.from('appointments').select('starts_at, status').eq('agency_id', agencyId).gte('starts_at', ab).in('status', ['proposed', 'booked', 'confirmed']),
  ]);
  const a = ((alt ?? []) as Array<{ type: string; scheduled_at: string; status: string | null }>).filter((x) => (x.status ?? 'geplant') === 'geplant');
  const vg = [...a.filter((x) => x.type === 'vorstellungsgespraech').map((x) => x.scheduled_at), ...((neu ?? []) as Array<{ starts_at: string }>).map((x) => x.starts_at)].sort();
  const pt = a.filter((x) => x.type === 'probetag').map((x) => x.scheduled_at).sort();
  return { vorstellungsgespraeche: vg.length, naechstesGespraech: vg[0] ?? null, probetage: pt.length, naechsterProbetag: pt[0] ?? null };
}

/** Alles für Dashboard und Umsätze-Seite */
export async function ladeRoiUebersicht(svc: SupabaseClient, agencyId: string, jetzt: Date = new Date()) {
  const [einstellungen, eintraege, kosten, termine] = await Promise.all([
    ladeEinstellungen(svc, agencyId),
    ladeUmsaetze(svc, agencyId),
    ladeKosten(svc, agencyId),
    ladeGeplanteTermine(svc, agencyId, jetzt),
  ]);
  const roi = berechneRoi({ einstellungen, eintraege, kosten, jetzt });
  const vor30 = new Date(jetzt.getTime() - 30 * 864e5).toISOString();
  const aktuell = monatVon(jetzt);
  const monate = Array.from({ length: 6 }, (_, i) => monatPlus(aktuell, i - 6)); // letzte 6 abgeschlossene Monate
  return {
    roi,
    termine,
    einstellungen30: einstellungen.filter((h) => h.eingestellt_am >= vor30).length,
    einstellungenGesamt: einstellungen.length,
    monate,
    vertriebler: einstellungen.map((h) => ({
      ...h,
      eintraege: Object.fromEntries(eintraege.filter((x) => x.candidate_id === h.id).map((x) => [x.monat, { umsatz: x.umsatz, provision: x.provision, aktiv: x.aktiv }])),
    })),
  };
}

export type RoiUebersicht = Awaited<ReturnType<typeof ladeRoiUebersicht>>;
