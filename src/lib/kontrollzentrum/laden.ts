import type { SupabaseClient } from '@supabase/supabase-js';
import { agencyLogo } from '@/lib/branding/logo';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';
import { mitInnendienst } from '@/lib/fulfillment/pakete';
import { istEingestelltStage } from '@/lib/pipeline/get-stages';
import { fetchAll, fetchAllIn } from '@/lib/supabase/fetch-all';
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
  marge: Marge;
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
}

export interface Rohdaten {
  kunden: KundeRoh[];
  /** Paket-Key (klein) → Retainer, falls kein MRR hinterlegt */
  retainer: Map<string, number>;
  kandidaten: Array<KandidatRoh & { agency_id: string }>;
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
        kostenProEinstellung: kostenProEinstellung(mrr, zahl(a.werbebudget), jetztK.einstellungen),
        marge: berechneMarge({
          umsatz: mrr,
          teamMinuten: r.teamMinuten ? r.teamMinuten.get(a.id) ?? 0 : null,
          stundensatz: r.stundensatz,
          anrufMinuten: r.anrufMinuten.get(a.id) ?? 0,
          vorlagen: r.vorlagen.get(a.id) ?? 0,
        }),
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
        .select('id, name, settings, fulfillment_phase, pausiert_grund, csm_user_id, mrr, werbebudget, paket, bausteine, garantie_ist, garantie_ziel_starter')
        .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`)
        .order('name'),
      svc.from('paket_definitionen').select('key, retainer_netto'),
      svc.from('pipeline_stages').select('id, name, stage_type'),
      svc.from('system_einstellungen').select('key, wert').in('key', ['bewerber_kontakt', 'stundensatz_intern']),
      fetchAll<KandidatRoh & { agency_id: string }>((von, bis) =>
        svc
          .from('candidates')
          .select('id, agency_id, created_at, first_contact_at, ttfc_seconds')
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
      fetchAll<{ agency_id: string; last_login: string | null }>((von, bis) =>
        svc
          .from('users')
          .select('agency_id, last_login')
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
    nutzer,
    whatsapp: new Set(whatsapp.map((w) => w.agency_id)),
    kontaktSchalter: werte.get('bewerber_kontakt') ?? null,
    stundensatz: liesZahl(werte.get('stundensatz_intern')),
    teamMinuten,
    anrufMinuten: summiere(mitKunde(twilio), (x) => (x.dauer_sekunden ?? 0) / 60),
    vorlagen: summiere(mitKunde(vorlagen), () => 1),
  };
}

export async function ladeKontrollzentrum(svc: SupabaseClient, jetzt: Date = new Date()): Promise<Kontrollzentrum> {
  const roh = await ladeRohdaten(svc, jetzt);
  return {
    zeilen: baueZeilen(roh, jetzt),
    zeiterfassung: roh.teamMinuten !== null,
    stundensatz: roh.stundensatz,
    stand: jetzt.toISOString(),
  };
}
