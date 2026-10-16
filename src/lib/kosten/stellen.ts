/**
 * Echte Werbekosten je Stellenanzeige und Kunde: Meta (Ausgaben der Kampagnen im Werbekonto des Kunden,
 * je Stelle über die Kampagnen-Zuordnung) + Indeed (Tagesbudget × Tage) → Kosten pro Bewerber / Termin / Einstellung.
 * Ergebnisse (Bewerber, Termine, Einstellungen) zählen im selben Zeitraum wie die Kosten.
 * Kosten ohne Stellen-Zuordnung zählen nur beim Kunden (Gesamt), nicht bei einer Stelle.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { istSchemaFehler } from '@/lib/appointments/termin-format';
import { metaKundenToken, normalisiereAdAccount } from '@/lib/meta/ad-account';
import { ladeEinstellungen } from '@/lib/roi/laden';
import { fetchAll, fetchAllIn } from '@/lib/supabase/fetch-all';
import { indeedKosten, type BudgetPhase } from '@/lib/werbekosten/indeed-budget';

export type Quelle = 'meta' | 'indeed' | 'sonstige';
export type MetaStatus = 'ok' | 'kein_werbekonto' | 'nicht_verbunden' | 'kein_zugriff' | 'tabelle_fehlt';

export interface KostenZeile {
  job_id: string | null;
  titel: string;
  metaKosten: number;
  indeedKosten: number;
  kosten: number;
  bewerber: number;
  bewerberQuelle: Record<Quelle, number>;
  termine: number;
  einstellungen: number;
  kampagnen: number;
  kostenProBewerber: number | null;
  metaKostenProBewerber: number | null;
  indeedKostenProBewerber: number | null;
  kostenProTermin: number | null;
  kostenProEinstellung: number | null;
}

export interface StellenKosten {
  von: string;
  bis: string;
  stellen: KostenZeile[];
  gesamt: KostenZeile;
  /** Kosten ohne Stellen-Zuordnung (nur in Gesamt enthalten) */
  ohneStelle: { meta: number; indeed: number };
  meta: MetaStatus;
  /** Indeed-Budget je Stelle möglich (Spalte indeed_budget.job_id vorhanden) */
  indeedJeStelle: boolean;
  letzterAbgleich: string | null;
}

export interface KostenEingabe {
  von: string;
  bis: string;
  stellen: Array<{ id: string; title: string }>;
  /** Kampagne → Stelle */
  zuordnungen: Array<{ campaign_id: string; job_id: string | null }>;
  /** Alle Kampagnen-Tage des Kunden-Werbekontos */
  metaTage: Array<{ campaign_id: string; datum: string; spend: number | string }>;
  indeedPhasen: BudgetPhase[];
  bewerber: Array<{ source: string | null; job_id: string | null }>;
  termine: Array<{ job_id: string | null }>;
  einstellungen: Array<{ job_id: string | null }>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const teile = (a: number, b: number) => (b > 0 && a > 0 ? r2(a / b) : null);

export function quelleVon(source: string | null | undefined): Quelle {
  const s = (source ?? '').toLowerCase();
  if (s === 'meta' || s === 'facebook' || s === 'instagram' || s === 'perspective') return 'meta';
  if (s === 'indeed') return 'indeed';
  return 'sonstige';
}

function zeile(job_id: string | null, titel: string): KostenZeile {
  return {
    job_id, titel, metaKosten: 0, indeedKosten: 0, kosten: 0, bewerber: 0, bewerberQuelle: { meta: 0, indeed: 0, sonstige: 0 },
    termine: 0, einstellungen: 0, kampagnen: 0, kostenProBewerber: null, metaKostenProBewerber: null, indeedKostenProBewerber: null,
    kostenProTermin: null, kostenProEinstellung: null,
  };
}

function abschliessen(z: KostenZeile): KostenZeile {
  z.metaKosten = r2(z.metaKosten);
  z.indeedKosten = r2(z.indeedKosten);
  z.kosten = r2(z.metaKosten + z.indeedKosten);
  z.kostenProBewerber = teile(z.kosten, z.bewerber);
  z.metaKostenProBewerber = teile(z.metaKosten, z.bewerberQuelle.meta);
  z.indeedKostenProBewerber = teile(z.indeedKosten, z.bewerberQuelle.indeed);
  z.kostenProTermin = teile(z.kosten, z.termine);
  z.kostenProEinstellung = teile(z.kosten, z.einstellungen);
  return z;
}

/** Kosten und Ergebnisse je Stelle + Gesamt (rein, testbar) */
export function berechneStellenKosten(e: KostenEingabe): Omit<StellenKosten, 'meta' | 'indeedJeStelle' | 'letzterAbgleich'> {
  const zeilen = new Map(e.stellen.map((s) => [s.id, zeile(s.id, s.title)]));
  const gesamt = zeile(null, 'Gesamt');
  const ohneStelle = { meta: 0, indeed: 0 };
  const stelleDerKampagne = new Map(e.zuordnungen.map((z) => [z.campaign_id, z.job_id]));

  for (const z of e.zuordnungen) {
    const s = z.job_id ? zeilen.get(z.job_id) : undefined;
    if (s) s.kampagnen++;
  }
  const kampagnen = new Set<string>();
  for (const t of e.metaTage) {
    if (t.datum < e.von || t.datum > e.bis) continue;
    kampagnen.add(t.campaign_id);
    const betrag = Number(t.spend) || 0;
    gesamt.metaKosten += betrag;
    const s = zeilen.get(stelleDerKampagne.get(t.campaign_id) ?? '');
    if (s) s.metaKosten += betrag;
    else ohneStelle.meta += betrag;
  }
  for (const p of e.indeedPhasen) {
    const { kosten } = indeedKosten([p], e.von, e.bis);
    gesamt.indeedKosten += kosten;
    const s = p.job_id ? zeilen.get(p.job_id) : undefined;
    if (s) s.indeedKosten += kosten;
    else ohneStelle.indeed += kosten;
  }
  gesamt.kampagnen = kampagnen.size;
  for (const b of e.bewerber) {
    const q = quelleVon(b.source);
    for (const z of [gesamt, b.job_id ? zeilen.get(b.job_id) : undefined]) {
      if (!z) continue;
      z.bewerber++;
      z.bewerberQuelle[q]++;
    }
  }
  for (const t of e.termine) {
    gesamt.termine++;
    const s = t.job_id ? zeilen.get(t.job_id) : undefined;
    if (s) s.termine++;
  }
  for (const x of e.einstellungen) {
    gesamt.einstellungen++;
    const s = x.job_id ? zeilen.get(x.job_id) : undefined;
    if (s) s.einstellungen++;
  }

  return {
    von: e.von,
    bis: e.bis,
    stellen: [...zeilen.values()].map(abschliessen),
    gesamt: abschliessen(gesamt),
    ohneStelle: { meta: r2(ohneStelle.meta), indeed: r2(ohneStelle.indeed) },
  };
}

/** YYYY-MM-DD (Berlin) → ISO-Zeitpunkt 00:00 Berliner Zeit */
export function berlinTagesbeginn(datum: string): string {
  const utc = new Date(`${datum}T00:00:00Z`);
  const wand = new Date(utc.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const utcWand = new Date(utc.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(utc.getTime() - (wand.getTime() - utcWand.getTime())).toISOString();
}

export const berlinTag = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const naechsterTag = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

/** Zeitraum der letzten `tage` Tage inkl. heute (Berlin) */
export function zeitraum(tage: number, jetzt: Date = new Date()): { von: string; bis: string } {
  return { von: berlinTag(new Date(jetzt.getTime() - (tage - 1) * 864e5)), bis: berlinTag(jetzt) };
}

const ABGESAGT = ['abgesagt', 'cancelled', 'canceled'];

/** Summe je Kunde (rein) */
export function summeJeKunde(rows: Array<{ agency_id: string; spend: number | string | null }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.agency_id, r2((out.get(r.agency_id) ?? 0) + (Number(r.spend) || 0)));
  return out;
}

/**
 * Meta-Ausgaben je Kunde im Zeitraum aus dem Kampagnen-Abgleich; fehlt die Tabelle, aus den
 * Konto-Tageswerten (meta_ad_reports). null, wenn keine Quelle lesbar ist.
 */
export async function ladeMetaAusgabenJeKunde(svc: SupabaseClient, von: string, bis: string): Promise<Map<string, number> | null> {
  try {
    const tage = await fetchAll<{ agency_id: string; spend: number | string }>((a, b) =>
      svc.from('meta_kampagnen_kosten').select('agency_id, spend').gte('datum', von).lte('datum', bis).order('id').range(a, b),
    );
    return summeJeKunde(tage);
  } catch {
    try {
      const tage = await fetchAll<{ agency_id: string; spend: number | string }>((a, b) =>
        svc.from('meta_ad_reports').select('agency_id, spend').gte('report_date', von).lte('report_date', bis).order('id').range(a, b),
      );
      return summeJeKunde(tage);
    } catch {
      return null;
    }
  }
}

/** Indeed-Phasen (mit job_id, falls die Spalte schon existiert) */
export async function ladeIndeedPhasen(svc: SupabaseClient, agencyId?: string): Promise<{ phasen: Array<BudgetPhase & { agency_id: string }>; jeStelle: boolean }> {
  const basis = (felder: string) => {
    const q = svc.from('indeed_budget').select(felder);
    return agencyId ? q.eq('agency_id', agencyId) : q;
  };
  const mit = await basis('id, agency_id, tagesbudget, start, ende, job_id');
  const jeStelle = !istSchemaFehler(mit.error);
  const { data } = jeStelle ? mit : await basis('id, agency_id, tagesbudget, start, ende');
  const phasen = ((data ?? []) as unknown as Array<BudgetPhase & { agency_id: string }>).map((p) => ({ ...p, tagesbudget: Number(p.tagesbudget) }));
  return { phasen, jeStelle };
}

/** Kosten je Stelle und Kunde für den Zeitraum [von, bis] (Berliner Tage, inklusive) */
export async function ladeStellenKosten(svc: SupabaseClient, agencyId: string, z: { von: string; bis: string }): Promise<StellenKosten> {
  const abIso = berlinTagesbeginn(z.von);
  const bisIso = berlinTagesbeginn(naechsterTag(z.bis));

  const [{ data: jobs }, { data: agency }, zuordnungRes, kostenRes, indeed, bewerberRoh, neueTermine, alteTermine, einstellungen] = await Promise.all([
    svc.from('jobs').select('id, title, status').eq('agency_id', agencyId).order('created_at'),
    svc.from('agencies').select('meta_ad_account_id, settings').eq('id', agencyId).maybeSingle(),
    svc.from('meta_kampagnen_zuordnung').select('campaign_id, job_id').eq('agency_id', agencyId),
    fetchAll<{ campaign_id: string; datum: string; spend: number | string; fetched_at: string }>((a, b) =>
      svc.from('meta_kampagnen_kosten').select('campaign_id, datum, spend, fetched_at').eq('agency_id', agencyId).gte('datum', z.von).lte('datum', z.bis).order('id').range(a, b),
    ).then((rows) => ({ rows, fehlt: false }), () => ({ rows: [] as Array<{ campaign_id: string; datum: string; spend: number | string; fetched_at: string }>, fehlt: true })),
    ladeIndeedPhasen(svc, agencyId),
    fetchAll<{ id: string; source: string | null }>((a, b) =>
      svc.from('candidates').select('id, source').eq('agency_id', agencyId).is('deleted_at', null).gte('created_at', abIso).lt('created_at', bisIso).order('id').range(a, b),
    ),
    fetchAll<{ application_id: string | null; status: string | null }>((a, b) =>
      svc.from('appointments').select('application_id, status').eq('agency_id', agencyId).gte('starts_at', abIso).lt('starts_at', bisIso).order('id').range(a, b),
    ).catch(() => []),
    fetchAll<{ candidate_id: string; status: string | null }>((a, b) =>
      svc.from('candidate_appointments').select('candidate_id, status').eq('agency_id', agencyId).gte('scheduled_at', abIso).lt('scheduled_at', bisIso).order('id').range(a, b),
    ).catch(() => []),
    ladeEinstellungen(svc, agencyId).catch(() => []),
  ]);

  const tabelleFehlt = kostenRes.fehlt || istSchemaFehler(zuordnungRes.error);
  const zuordnungen = istSchemaFehler(zuordnungRes.error) ? [] : ((zuordnungRes.data ?? []) as Array<{ campaign_id: string; job_id: string | null }>);
  let metaTage: Array<{ campaign_id: string; datum: string; spend: number | string }> = kostenRes.rows;
  const letzterAbgleich = kostenRes.rows.map((t) => t.fetched_at ?? '').sort().at(-1) || null;
  // Ohne Kampagnen-Tabelle: Konto-Tageswerte als Gesamt (keine Aufteilung auf Stellen)
  if (kostenRes.fehlt) {
    const { data: konto } = await svc.from('meta_ad_reports').select('report_date, spend').eq('agency_id', agencyId).gte('report_date', z.von).lte('report_date', z.bis);
    metaTage = ((konto ?? []) as Array<{ report_date: string; spend: number | string }>).map((k) => ({ campaign_id: 'konto', datum: k.report_date, spend: k.spend }));
  }
  const a = agency as { meta_ad_account_id: string | null; settings: { meta_sync?: { status?: string } } | null } | null;
  const metaStatus: MetaStatus = !normalisiereAdAccount(a?.meta_ad_account_id)
    ? 'kein_werbekonto'
    : !metaKundenToken()
      ? 'nicht_verbunden'
      : tabelleFehlt
        ? 'tabelle_fehlt'
        : a?.settings?.meta_sync?.status === 'kein_zugriff'
          ? 'kein_zugriff'
          : 'ok';

  // Stelle je Bewerber über seine (erste) Bewerbung
  const imZeitraum = einstellungen.filter((x) => x.eingestellt_am >= abIso && x.eingestellt_am < bisIso);
  const terminTermine = alteTermine.filter((t) => !ABGESAGT.includes(t.status ?? ''));
  const kandidatenIds = [...new Set([...bewerberRoh.map((b) => b.id), ...terminTermine.map((t) => t.candidate_id), ...imZeitraum.map((x) => x.id)])];
  const apps = await fetchAllIn<string, { id: string; candidate_id: string; job_id: string | null; created_at: string }>(kandidatenIds, (chunk, a, b) =>
    svc.from('applications').select('id, candidate_id, job_id, created_at').eq('agency_id', agencyId).in('candidate_id', chunk).order('created_at').range(a, b),
  ).catch(() => []);
  const stelleVon = new Map<string, string | null>();
  for (const ap of apps) if (!stelleVon.has(ap.candidate_id)) stelleVon.set(ap.candidate_id, ap.job_id);

  const neueAktiv = neueTermine.filter((t) => !ABGESAGT.includes(t.status ?? ''));
  const appIds = [...new Set(neueAktiv.map((t) => t.application_id).filter((x): x is string => !!x))];
  const appStelle = new Map(apps.map((ap) => [ap.id, ap.job_id]));
  const fehlend = appIds.filter((id) => !appStelle.has(id));
  if (fehlend.length) {
    const weitere = await fetchAllIn<string, { id: string; job_id: string | null }>(fehlend, (chunk, a, b) =>
      svc.from('applications').select('id, job_id').in('id', chunk).order('id').range(a, b),
    ).catch(() => []);
    for (const ap of weitere) appStelle.set(ap.id, ap.job_id);
  }

  const ergebnis = berechneStellenKosten({
    ...z,
    stellen: ((jobs ?? []) as Array<{ id: string; title: string }>).map((j) => ({ id: j.id, title: j.title })),
    zuordnungen,
    metaTage,
    indeedPhasen: indeed.phasen,
    bewerber: bewerberRoh.map((b) => ({ source: b.source, job_id: stelleVon.get(b.id) ?? null })),
    termine: [
      ...neueAktiv.map((t) => ({ job_id: (t.application_id && appStelle.get(t.application_id)) || null })),
      ...terminTermine.map((t) => ({ job_id: stelleVon.get(t.candidate_id) ?? null })),
    ],
    einstellungen: imZeitraum.map((x) => ({ job_id: stelleVon.get(x.id) ?? null })),
  });

  return {
    ...ergebnis,
    meta: metaStatus,
    indeedJeStelle: indeed.jeStelle,
    letzterAbgleich,
  };
}

