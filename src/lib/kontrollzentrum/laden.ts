import type { SupabaseClient } from '@supabase/supabase-js';
import { agencyLogo } from '@/lib/branding/logo';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';
import { mitInnendienst } from '@/lib/fulfillment/pakete';
import { istEingestelltStage } from '@/lib/pipeline/get-stages';
import { fetchAll, fetchAllIn } from '@/lib/supabase/fetch-all';
import { ladeIndeedPhasen, ladeMetaAusgabenJeKunde, zeitraum } from '@/lib/kosten/stellen';
import { indeedKosten } from '@/lib/werbekosten/indeed-budget';
import {
  FENSTER_TAGE,
  ROT_SEIT_TAGEN,
  berechneMarge,
  bewerberKontaktAktiv,
  bewerteAmpel,
  churnRisiko,
  einstellungsZeitpunkte,
  fenster,
  kennzahlen,
  keinLogin,
  kostenProEinstellung,
  liesZahl,
  upsellSignal,
  type Ampel,
  type KandidatRoh,
  type Kennzahlen,
  type Marge,
  type TerminRoh,
} from './bewertung';
import { berechneHealthScore, healthKennzahlen, ladeHealthSnapshots, mitSnapshots, type HealthAnzeige } from './health-score';
import { today } from '@/lib/fulfillment/views';

/** Kontrollzentrum: alle Kunden auf einer Seite – Ergebnisse, Nutzung, Ampel, Upsell, Churn und Marge (letzte 30 Tage). */

export interface KontrollZeile {
  id: string;
  name: string;
  logo_url: string | null;
  phase: string | null;
  pausiert: boolean;
  csm_user_id: string | null;
  jetzt: Kennzahlen;
  vorher: Kennzahlen;
  nutzung: {
    kundenNutzer: number;
    aktiveNutzer: number;
    letzterLogin: string | null;
    whatsappVerbunden: boolean;
    bewerberKontaktAktiv: boolean;
  };
  ampel: Ampel;
  gruende: string[];
  upsell: { signal: boolean; gruende: string[]; vorschlaege: string[] };
  churn: { risiko: boolean; gruende: string[] };
  kostenProEinstellung: number | null;
  /** Echte Meta-Ausgaben der letzten 30 Tage (Werbekonto); null = nicht abgeglichen → Werbebudget als Schätzung */
  metaAusgaben: number | null;
  /** Indeed-Kosten 30 Tage aus dem Tagesbudget – nur Info, nicht in Marge/€ pro Einstellung */
  indeedKosten: number | null;
  marge: Marge;
  /** Health-Score 0–100 (Snapshot von heute, sonst live); null = nicht aktiv (pausiert/Offboarding) */
  health: HealthAnzeige | null;
}

export interface Kontrollzentrum {
  zeilen: KontrollZeile[];
  /** Zeiterfassung (zeiteintraege) bzw. Stundensatz vorhanden? */
  zeiterfassung: boolean;
  stundensatz: number | null;
  stand: string;
}

export interface KundeRoh {
  id: string;
  name: string;
  settings: unknown;
  fulfillment_phase: string | null;
  pausiert_grund: string | null;
  csm_user_id: string | null;
  mrr: number | string | null;
  werbebudget: number | string | null;
  paket: string | null;
  bausteine: unknown;
  garantie_ist: number | null;
  garantie_ziel_starter: number | null;
  /** Beginn der aktuellen Phase (für „Onboarding hängt“ und Laufzeit) */
  fulfillment_phase_seit?: string | null;
}

/** Zusatzdaten nur für den Health-Score (optional, damit ältere Aufrufer/Tests ohne auskommen) */
export interface HealthRoh {
  /** candidate_appointments mit Status „geplant“ in der Vergangenheit */
  offeneTermine: Array<{ agency_id: string; datum: string }>;
  /** Bewerber aktuell in der Probetag-Stufe, seit wann */
  probetag: Array<{ agency_id: string; seit: string }>;
  /** Offene Prüfstand-Fälle je vorgeschlagenem Kunden */
  pruefstand: Map<string, number>;
  /** Nicht eingelöste Einladungen */
  einladungen: Array<{ agency_id: string; created_at: string }>;
  /** Stufen-IDs „eingestellt“/„abgesagt“ */
  abgeschlossen: Set<string>;
}

export interface Rohdaten {
  kunden: KundeRoh[];
  /** Paket-Key (klein) → Retainer, falls kein MRR hinterlegt */
  retainer: Map<string, number>;
  kandidaten: Array<KandidatRoh & { agency_id: string; first_dial_at?: string | null; current_stage_id?: string | null }>;
  anrufe: Array<{ agency_id: string; candidate_id: string | null; created_at: string }>;
  termine: Array<TerminRoh & { agency_id: string }>;
  einstellungen: Array<{ agency_id: string; datum: string }>;
  nutzer: Array<{ agency_id: string; last_login: string | null }>;
  whatsapp: Set<string>;
  kontaktSchalter: unknown;
  stundensatz: number | null;
  /** null = keine Zeiterfassung */
  teamMinuten: Map<string, number> | null;
  anrufMinuten: Map<string, number>;
  vorlagen: Map<string, number>;
  /** Meta-Ausgaben 30 Tage je Kunde (null/fehlend = Tabelle fehlt oder kein Abgleich) */
  metaAusgaben?: Map<string, number> | null;
  /** Indeed-Kosten 30 Tage je Kunde (Info) */
  indeedKosten?: Map<string, number> | null;
  /** Zusatzdaten für den Health-Score */
  health?: HealthRoh;
}

function gruppiere<T extends { agency_id: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const l = m.get(r.agency_id);
    if (l) l.push(r);
    else m.set(r.agency_id, [r]);
  }
  return m;
}

const zahl = (v: number | string | null) => (v === null || v === '' ? null : Number(v));
const RANG: Record<Ampel, number> = { rot: 0, gelb: 1, gruen: 2 };

/** Zeilen aus den gesammelten Rohdaten bauen (rein, testbar) */
export function baueZeilen(r: Rohdaten, jetzt: Date): KontrollZeile[] {
  const f = fenster(jetzt, FENSTER_TAGE);
  const fVorher = fenster(jetzt, 2 * FENSTER_TAGE, FENSTER_TAGE);
  const fFrueher = fenster(jetzt, FENSTER_TAGE + ROT_SEIT_TAGEN, ROT_SEIT_TAGEN);
  const fFrueherVorher = fenster(jetzt, 2 * FENSTER_TAGE + ROT_SEIT_TAGEN, FENSTER_TAGE + ROT_SEIT_TAGEN);

  const kand = gruppiere(r.kandidaten);
  const anr = gruppiere(r.anrufe);
  const ter = gruppiere(r.termine);
  const ein = gruppiere(r.einstellungen);
  const nut = gruppiere(r.nutzer);
  const hOffeneTermine = gruppiere(r.health?.offeneTermine ?? []);
  const hProbetag = gruppiere(r.health?.probetag ?? []);
  const hEinladungen = gruppiere(r.health?.einladungen ?? []);
  const abgeschlossen = r.health?.abgeschlossen ?? new Set<string>();

  return r.kunden
    .map((a) => {
      const anrufe = anr.get(a.id) ?? [];
      const daten = {
        kandidaten: kand.get(a.id) ?? [],
        angerufen: new Set(anrufe.map((x) => x.candidate_id).filter((x): x is string => !!x)),
        termine: ter.get(a.id) ?? [],
        einstellungen: (ein.get(a.id) ?? []).map((x) => x.datum),
        anrufe: anrufe.map((x) => x.created_at),
      };
      const jetztK = kennzahlen(daten, f);
      const vorher = kennzahlen(daten, fVorher);
      const nutzer = nut.get(a.id) ?? [];
      const letzterLogin = nutzer.map((u) => u.last_login).filter((x): x is string => !!x).sort().at(-1) ?? null;
      // In der Einrichtung muss sich der Kunde noch nicht einloggen
      const loginPruefen = !['zahlung', 'setup'].includes(a.fulfillment_phase ?? '') && !a.pausiert_grund;
      const keineLogins = keinLogin(letzterLogin, f);
      const { ampel, gruende } = bewerteAmpel(jetztK, vorher, { keineLogins, loginPruefen });
      const ampelFrueher = bewerteAmpel(kennzahlen(daten, fFrueher), kennzahlen(daten, fFrueherVorher), {
        keineLogins: keinLogin(letzterLogin, fFrueher),
        loginPruefen,
      }).ampel;

      const mrr = zahl(a.mrr) || (a.paket ? r.retainer.get(a.paket.trim().toLowerCase()) ?? null : null) || null;
      // Echte Meta-Ausgaben statt Werbebudget, sobald für den Kunden abgeglichen; Indeed wird nicht eingerechnet
      const metaAusgaben = r.metaAusgaben?.has(a.id) ? r.metaAusgaben.get(a.id)! : null;

      // Health-Score: nur für aktive Kunden (nicht pausiert, nicht im Offboarding)
      let health: HealthAnzeige | null = null;
      if (!a.pausiert_grund && a.fulfillment_phase !== 'offboarding') {
        const hk = healthKennzahlen(
          {
            phase: a.fulfillment_phase,
            phaseSeit: a.fulfillment_phase_seit ?? null,
            settings: a.settings,
            kandidaten: daten.kandidaten,
            angerufen: daten.angerufen,
            abgeschlossen,
            ttfcMedianSek: jetztK.ttfcMedianSek,
            leads30: jetztK.leads,
            kundenNutzer: nutzer.length,
            letzterLogin,
            loginPruefen,
            offeneTermine: (hOffeneTermine.get(a.id) ?? []).map((x) => x.datum),
            probetagSeit: (hProbetag.get(a.id) ?? []).map((x) => x.seit),
            einstellungen30: jetztK.einstellungen,
            pruefstandOffen: r.health?.pruefstand.get(a.id) ?? 0,
            einladungen: (hEinladungen.get(a.id) ?? []).map((x) => x.created_at),
          },
          jetzt,
        );
        health = { ...berechneHealthScore(hk), kennzahlen: hk, vor7: null, trend: null, quelle: 'live' };
      }
      return {
        id: a.id,
        name: a.name,
        logo_url: agencyLogo(a.settings),
        phase: a.fulfillment_phase,
        pausiert: !!a.pausiert_grund,
        csm_user_id: a.csm_user_id,
        jetzt: jetztK,
        vorher,
        nutzung: {
          kundenNutzer: nutzer.length,
          aktiveNutzer: nutzer.filter((u) => !keinLogin(u.last_login, f)).length,
          letzterLogin,
          whatsappVerbunden: r.whatsapp.has(a.id),
          bewerberKontaktAktiv: bewerberKontaktAktiv(r.kontaktSchalter, a.id),
        },
        ampel,
        gruende,
        upsell: upsellSignal({
          ampel,
          jetzt: jetztK,
          vorher,
          garantieErreicht: !!a.garantie_ziel_starter && (a.garantie_ist ?? 0) >= a.garantie_ziel_starter,
          mitInnendienst: mitInnendienst(a.bausteine),
        }),
        churn: churnRisiko({ ampel, ampelFrueher, keineLogins, loginPruefen, jetzt: jetztK, vorher }),
        kostenProEinstellung: kostenProEinstellung(mrr, metaAusgaben ?? zahl(a.werbebudget), jetztK.einstellungen),
        metaAusgaben,
        indeedKosten: r.indeedKosten?.get(a.id) ?? null,
        marge: berechneMarge({
          umsatz: mrr,
          teamMinuten: r.teamMinuten ? r.teamMinuten.get(a.id) ?? 0 : null,
          stundensatz: r.stundensatz,
          anrufMinuten: r.anrufMinuten.get(a.id) ?? 0,
          vorlagen: r.vorlagen.get(a.id) ?? 0,
        }),
        health,
      };
    })
    .sort(
      (x, y) =>
        Number(x.pausiert) - Number(y.pausiert) ||
        RANG[x.ampel] - RANG[y.ampel] ||
        Number(y.churn.risiko) - Number(x.churn.risiko) ||
        y.jetzt.leads - x.jetzt.leads ||
        x.name.localeCompare(y.name, 'de'),
    );
}

const summiere = <T extends { agency_id: string }>(rows: T[], wert: (r: T) => number) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.agency_id, (m.get(r.agency_id) ?? 0) + wert(r));
  return m;
};

/** Zeiterfassung eines anderen Moduls – fehlt die Tabelle, gibt es keine Teamkosten (null) */
async function ladeTeamMinuten(svc: SupabaseClient, ab: string): Promise<Map<string, number> | null> {
  try {
    const rows = await fetchAll<{ agency_id: string | null; start: string | null; ende: string | null; minuten: number | null }>((von, bis) =>
      svc.from('zeiteintraege').select('agency_id, start, ende, minuten').gte('start', ab).order('start').range(von, bis),
    );
    const mitKunde = rows.filter((x): x is typeof x & { agency_id: string } => !!x.agency_id);
    return summiere(mitKunde, (x) => {
      if (typeof x.minuten === 'number') return x.minuten;
      if (x.start && x.ende) return Math.max(0, (new Date(x.ende).getTime() - new Date(x.start).getTime()) / 60000);
      return 0;
    });
  } catch {
    return null;
  }
}

/** Optionale Quelle tolerant laden (Tabelle/Spalte fehlt → leer) */
async function optional<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch {
    return [];
  }
}

export async function ladeRohdaten(svc: SupabaseClient, jetzt: Date = new Date()): Promise<Rohdaten> {
  // Daten für jetzt, Vorperiode und das 14 Tage frühere Fenster (Churn „seit 2 Wochen rot“)
  const ab = fenster(jetzt, 2 * FENSTER_TAGE + ROT_SEIT_TAGEN).von;
  const ab30 = fenster(jetzt, FENSTER_TAGE).von;

  const [{ data: ags, error: agErr }, { data: pakete }, { data: stufen }, { data: einst }, kandidaten, anrufe, alteTermine, neueTermine, nutzer, whatsapp, twilio, vorlagen, teamMinuten] =
    await Promise.all([
      svc
        .from('agencies')
        .select('id, name, settings, fulfillment_phase, fulfillment_phase_seit, pausiert_grund, csm_user_id, mrr, werbebudget, paket, bausteine, garantie_ist, garantie_ziel_starter')
        .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`)
        .order('name'),
      svc.from('paket_definitionen').select('key, retainer_netto'),
      svc.from('pipeline_stages').select('id, name, stage_type'),
      svc.from('system_einstellungen').select('key, wert').in('key', ['bewerber_kontakt', 'stundensatz_intern']),
      fetchAll<KandidatRoh & { agency_id: string; first_dial_at: string | null; current_stage_id: string | null }>((von, bis) =>
        svc
          .from('candidates')
          .select('id, agency_id, created_at, first_contact_at, ttfc_seconds, first_dial_at, current_stage_id')
          .is('deleted_at', null)
          .gte('created_at', ab)
          .order('id')
          .range(von, bis),
      ),
      fetchAll<{ agency_id: string; candidate_id: string | null; created_at: string }>((von, bis) =>
        svc.from('call_logs').select('agency_id, candidate_id, created_at').gte('created_at', ab).order('id').range(von, bis),
      ),
      fetchAll<{ agency_id: string; status: string | null; scheduled_at: string }>((von, bis) =>
        svc.from('candidate_appointments').select('agency_id, status, scheduled_at').gte('scheduled_at', ab).lte('scheduled_at', jetzt.toISOString()).order('id').range(von, bis),
      ),
      fetchAll<{ agency_id: string; status: string | null; starts_at: string }>((von, bis) =>
        svc.from('appointments').select('agency_id, status, starts_at').gte('starts_at', ab).lte('starts_at', jetzt.toISOString()).order('id').range(von, bis),
      ),
      fetchAll<{ id: string; agency_id: string; last_login: string | null }>((von, bis) =>
        svc
          .from('users')
          .select('id, agency_id, last_login')
          .in('role', ['agency_owner', 'agency_member', 'agency_viewer'])
          .not('agency_id', 'is', null)
          .order('id')
          .range(von, bis),
      ),
      fetchAll<{ agency_id: string }>((von, bis) => svc.from('whatsapp_accounts').select('agency_id').eq('status', 'connected').order('id').range(von, bis)),
      optional(
        fetchAll<{ agency_id: string | null; dauer_sekunden: number | null }>((von, bis) =>
          svc.from('twilio_anrufe').select('agency_id, dauer_sekunden').gte('created_at', ab30).order('id').range(von, bis),
        ),
      ),
      optional(
        fetchAll<{ agency_id: string | null }>((von, bis) =>
          svc.from('messages').select('agency_id').eq('type', 'template').eq('direction', 'out').gte('created_at', ab30).order('id').range(von, bis),
        ),
      ),
      ladeTeamMinuten(svc, ab30),
    ]);
  const tage = zeitraum(FENSTER_TAGE, jetzt);
  const [metaAusgaben, indeed] = await Promise.all([
    ladeMetaAusgabenJeKunde(svc, tage.von, tage.bis).catch(() => null),
    ladeIndeedPhasen(svc).catch(() => null),
  ]);
  let indeedJeKunde: Map<string, number> | null = null;
  if (indeed) {
    indeedJeKunde = new Map();
    for (const p of indeed.phasen) {
      const k = indeedKosten([p], tage.von, tage.bis).kosten;
      if (k > 0) indeedJeKunde.set(p.agency_id, Math.round(((indeedJeKunde.get(p.agency_id) ?? 0) + k) * 100) / 100);
    }
  }
  if (agErr) throw new Error(`Kunden konnten nicht geladen werden: ${agErr.message}`);

  // Einstellungen: eingestellt_am, aktuelle Einstellungs-Stufe oder Wechsel dorthin
  const hired = new Set(((stufen ?? []) as Array<{ id: string; name: string; stage_type: string | null }>).filter(istEingestelltStage).map((s) => s.id));
  const hiredIds = [...hired];
  type Eingestellt = { id: string; agency_id: string; eingestellt_am: string | null; current_stage_id: string | null; created_at: string };
  const felder = 'id, agency_id, eingestellt_am, current_stage_id, created_at';
  const [direkt, aktuell, wechsel] = await Promise.all([
    fetchAll<Eingestellt>((von, bis) => svc.from('candidates').select(felder).is('deleted_at', null).gte('eingestellt_am', ab).order('id').range(von, bis)),
    fetchAllIn<string, Eingestellt>(hiredIds, (chunk, von, bis) =>
      svc.from('candidates').select(felder).is('deleted_at', null).is('eingestellt_am', null).in('current_stage_id', chunk).order('id').range(von, bis),
    ),
    fetchAllIn<string, { candidate_id: string; changed_at: string }>(hiredIds, (chunk, von, bis) =>
      svc.from('candidate_stages').select('candidate_id, changed_at').in('stage_id', chunk).gte('changed_at', ab).order('id').range(von, bis),
    ),
  ]);
  const bekannt = new Set([...direkt, ...aktuell].map((k) => k.id));
  const nurWechsel = [...new Set(wechsel.map((w) => w.candidate_id))].filter((id) => !bekannt.has(id));
  const ehemals = await fetchAllIn<string, Eingestellt>(nurWechsel, (chunk, von, bis) =>
    svc.from('candidates').select(felder).is('deleted_at', null).in('id', chunk).order('id').range(von, bis),
  );
  // Wer heute ein eingestellt_am hat, zählt mit diesem Datum (auch wenn es vor dem Fenster liegt)
  const ohneDirekt = [...aktuell, ...ehemals].filter((k) => !k.eingestellt_am);

  const werte = new Map(((einst ?? []) as Array<{ key: string; wert: unknown }>).map((x) => [x.key, x.wert]));
  const alleStufen = (stufen ?? []) as Array<{ id: string; name: string; stage_type: string | null }>;
  const health = await ladeHealthRoh(svc, alleStufen, hired, alteTermine, jetzt);
  const authLogin = await ladeAuthLogins(svc);
  const mitKunde = <T extends { agency_id: string | null }>(rows: T[]) => rows.filter((x): x is T & { agency_id: string } => !!x.agency_id);

  return {
    kunden: ((ags ?? []) as KundeRoh[]).filter((a) => a.fulfillment_phase !== 'beendet'),
    retainer: new Map(
      ((pakete ?? []) as Array<{ key: string; retainer_netto: number | string | null }>)
        .filter((p) => Number(p.retainer_netto) > 0)
        .map((p) => [p.key.trim().toLowerCase(), Number(p.retainer_netto)]),
    ),
    kandidaten,
    anrufe,
    termine: [
      ...alteTermine.map((x) => ({ agency_id: x.agency_id, status: x.status, datum: x.scheduled_at })),
      ...neueTermine.map((x) => ({ agency_id: x.agency_id, status: x.status, datum: x.starts_at })),
    ],
    einstellungen: [
      ...direkt.map((k) => ({ agency_id: k.agency_id, datum: k.eingestellt_am! })),
      ...einstellungsZeitpunkte(ohneDirekt, wechsel, hired),
    ],
    // Letzter Login: users.last_login bzw. auth.users.last_sign_in_at – der jüngere gilt
    nutzer: nutzer.map((u) => {
      const auth = authLogin.get(u.id) ?? null;
      return { agency_id: u.agency_id, last_login: !auth ? u.last_login : !u.last_login || auth > u.last_login ? auth : u.last_login };
    }),
    whatsapp: new Set(whatsapp.map((w) => w.agency_id)),
    kontaktSchalter: werte.get('bewerber_kontakt') ?? null,
    stundensatz: liesZahl(werte.get('stundensatz_intern')),
    teamMinuten,
    anrufMinuten: summiere(mitKunde(twilio), (x) => (x.dauer_sekunden ?? 0) / 60),
    vorlagen: summiere(mitKunde(vorlagen), () => 1),
    metaAusgaben,
    indeedKosten: indeedJeKunde,
    health,
  };
}

/** Optionale Health-Quelle: Fehler loggen statt die ganze Seite scheitern zu lassen */
async function optionalLog<T>(was: string, p: Promise<T>, leer: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error(`[kontrollzentrum] Health-Daten „${was}“ nicht geladen:`, err);
    return leer;
  }
}

/** auth.users.last_sign_in_at je User-ID (seitenweise über die Admin-API) */
async function ladeAuthLogins(svc: SupabaseClient): Promise<Map<string, string | null>> {
  return optionalLog(
    'auth.users',
    (async () => {
      const m = new Map<string, string | null>();
      for (let page = 1; page <= 50; page++) {
        const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error(error.message);
        for (const u of data.users) m.set(u.id, u.last_sign_in_at ?? null);
        if (data.users.length < 1000) break;
      }
      return m;
    })(),
    new Map(),
  );
}

/** Zusatzdaten für den Health-Score: offene Termine, Probetag-Stau, Prüfstand, Einladungen */
async function ladeHealthRoh(
  svc: SupabaseClient,
  stufen: Array<{ id: string; name: string; stage_type: string | null }>,
  hired: Set<string>,
  termine: Array<{ agency_id: string; status: string | null; scheduled_at: string }>,
  jetzt: Date,
): Promise<HealthRoh> {
  const abgeschlossen = new Set([
    ...hired,
    ...stufen.filter((s) => s.stage_type === 'rejected' || /^(abgesagt|abgelehnt)/i.test(s.name)).map((s) => s.id),
  ]);
  const probetagIds = stufen.filter((s) => s.stage_type === 'offer' || /probetag/i.test(s.name)).map((s) => s.id);
  const jetztIso = jetzt.toISOString();

  const [imProbetag, pruefstand, einladungen] = await Promise.all([
    optionalLog(
      'Probetag-Stufe',
      fetchAllIn<string, { id: string; agency_id: string; created_at: string }>(probetagIds, (chunk, von, bis) =>
        svc.from('candidates').select('id, agency_id, created_at').is('deleted_at', null).in('current_stage_id', chunk).order('id').range(von, bis),
      ),
      [],
    ),
    optionalLog(
      'Prüfstand',
      fetchAll<{ agency_vorschlag: string | null }>((von, bis) =>
        svc.from('bewerber_pruefstand').select('agency_vorschlag').in('status', ['wartet', 'offen']).not('agency_vorschlag', 'is', null).order('id').range(von, bis),
      ),
      [],
    ),
    optionalLog(
      'Einladungen',
      fetchAll<{ agency_id: string; created_at: string }>((von, bis) =>
        svc.from('invite_tokens').select('agency_id, created_at').eq('redeemed', false).order('id').range(von, bis),
      ),
      [],
    ),
  ]);

  // Seit wann in der Probetag-Stufe: letzter Wechsel dorthin, sonst Anlage des Bewerbers
  const wechsel = await optionalLog(
    'Probetag-Wechsel',
    fetchAllIn<string, { candidate_id: string; changed_at: string }>(
      imProbetag.map((k) => k.id),
      (chunk, von, bis) => svc.from('candidate_stages').select('candidate_id, changed_at').in('candidate_id', chunk).in('stage_id', probetagIds).order('id').range(von, bis),
    ),
    [],
  );
  const seit = new Map<string, string>();
  for (const w of wechsel) if (!seit.has(w.candidate_id) || w.changed_at > seit.get(w.candidate_id)!) seit.set(w.candidate_id, w.changed_at);

  const proKunde = new Map<string, number>();
  for (const p of pruefstand) if (p.agency_vorschlag) proKunde.set(p.agency_vorschlag, (proKunde.get(p.agency_vorschlag) ?? 0) + 1);

  return {
    offeneTermine: termine.filter((t) => t.status === 'geplant' && t.scheduled_at < jetztIso).map((t) => ({ agency_id: t.agency_id, datum: t.scheduled_at })),
    probetag: imProbetag.map((k) => ({ agency_id: k.agency_id, seit: seit.get(k.id) ?? k.created_at })),
    pruefstand: proKunde,
    einladungen,
    abgeschlossen,
  };
}

export async function ladeKontrollzentrum(svc: SupabaseClient, jetzt: Date = new Date()): Promise<Kontrollzentrum> {
  const heute = today(jetzt);
  const [roh, snapshots] = await Promise.all([ladeRohdaten(svc, jetzt), ladeHealthSnapshots(svc, heute)]);
  return {
    // Health: Snapshot von heute, sonst live berechnet; Trend gegen vor 7 Tagen
    zeilen: mitSnapshots(baueZeilen(roh, jetzt), snapshots, heute),
    zeiterfassung: roh.teamMinuten !== null,
    stundensatz: roh.stundensatz,
    stand: jetzt.toISOString(),
  };
}
