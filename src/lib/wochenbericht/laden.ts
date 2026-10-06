import type { SupabaseClient } from '@supabase/supabase-js';
import { STEP_BY_KEY, stepsForKunde, type Phase } from '@/lib/fulfillment/catalog';
import { bausteineVon } from '@/lib/fulfillment/pakete';
import { berechneRoi } from '@/lib/roi/berechnung';
import { ladeEinstellungen, ladeGeplanteTermine, ladeKosten, ladeUmsaetze } from '@/lib/roi/laden';
import { ladeEmpfehlungen } from '@/lib/empfehlungen/laden';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';
import { berechneWochenbericht, type Wochenbericht } from './berechnung';

const ERREICHT = ['termin_vereinbart', 'kein_interesse', 'rueckruf', 'sonstiges'];
const AUFBAU: Phase[] = ['zahlung', 'onboarding', 'setup'];

export interface BerichtKunde {
  id: string;
  name: string;
  phase: string | null;
  pausiert: boolean;
  empfaenger: Array<{ email: string; name: string | null }>;
}

/** Kunden, die einen Wochenbericht bekommen: aktiv, nicht pausiert, mit Login oder Kontakt-E-Mail */
export async function ladeBerichtKunden(svc: SupabaseClient, nurId?: string): Promise<BerichtKunde[]> {
  let q = svc
    .from('agencies')
    .select('id, name, email, contact_name, fulfillment_phase, pausiert_grund')
    .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`)
    .order('name');
  if (nurId) q = q.eq('id', nurId);
  const { data: ags } = await q;
  const liste = ((ags ?? []) as Array<{ id: string; name: string; email: string | null; contact_name: string | null; fulfillment_phase: string | null; pausiert_grund: string | null }>).filter(
    (a) => a.fulfillment_phase && a.fulfillment_phase !== 'beendet' && a.fulfillment_phase !== 'offboarding',
  );
  if (!liste.length) return [];
  const { data: users } = await svc
    .from('users')
    .select('agency_id, email, name, role, aktiv')
    .in('agency_id', liste.map((a) => a.id))
    .eq('role', 'agency_owner');
  return liste.map((a) => {
    const owner = ((users ?? []) as Array<{ agency_id: string; email: string | null; name: string | null; aktiv: boolean | null }>).filter(
      (u) => u.agency_id === a.id && u.email && u.aktiv !== false,
    );
    const empfaenger = owner.length
      ? owner.map((u) => ({ email: u.email!, name: u.name }))
      : a.email
        ? [{ email: a.email, name: a.contact_name }]
        : [];
    return { id: a.id, name: a.name, phase: a.fulfillment_phase, pausiert: !!a.pausiert_grund, empfaenger };
  });
}

/** Wochenbericht eines Kunden zum Zeitpunkt `jetzt` berechnen */
export async function ladeWochenbericht(
  svc: SupabaseClient,
  agencyId: string,
  jetzt: Date = new Date(),
  opts: { mitEmpfehlung?: boolean } = {},
): Promise<Wochenbericht | null> {
  const vor14 = new Date(jetzt.getTime() - 14 * 864e5).toISOString();
  const vor30 = new Date(jetzt.getTime() - 30 * 864e5).toISOString();
  const vor7 = new Date(jetzt.getTime() - 7 * 864e5).toISOString();

  const { data: a } = await svc
    .from('agencies')
    .select('name, contact_name, fulfillment_phase, bausteine')
    .eq('id', agencyId)
    .maybeSingle();
  const agency = a as { name: string; contact_name: string | null; fulfillment_phase: Phase | null; bausteine: unknown } | null;
  if (!agency) return null;
  const bausteine = bausteineVon(agency.bausteine);

  const [{ data: stufen }, { data: kand }, { data: calls }, { data: alteTermine }, { data: neueTermine }, { data: schritte }, einstellungen, geplant] = await Promise.all([
    svc.from('pipeline_stages').select('id, stage_type'),
    svc
      .from('candidates')
      .select('created_at, first_contact_at, erster_kontaktversuch_am, ttfc_seconds, current_stage_id, blacklisted')
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .gte('created_at', vor30)
      .limit(5000),
    svc.from('call_logs').select('created_at, result').eq('agency_id', agencyId).gte('created_at', vor14).limit(5000),
    svc.from('candidate_appointments').select('scheduled_at, status, type').eq('agency_id', agencyId).eq('type', 'vorstellungsgespraech').gte('scheduled_at', vor14).lte('scheduled_at', jetzt.toISOString()),
    svc.from('appointments').select('starts_at, status').eq('agency_id', agencyId).gte('starts_at', vor14).lte('starts_at', jetzt.toISOString()),
    svc.from('client_steps').select('step_key, phase, wer, status, faellig_am, erledigt_am').eq('agency_id', agencyId),
    ladeEinstellungen(svc, agencyId),
    ladeGeplanteTermine(svc, agencyId, jetzt),
  ]);

  const stageTyp = new Map(((stufen ?? []) as Array<{ id: string; stage_type: string | null }>).map((s) => [s.id, s.stage_type]));
  const steps = (schritte ?? []) as Array<{ step_key: string; phase: string; wer: string; status: string; faellig_am: string | null; erledigt_am: string | null }>;
  const titel = (k: string) => STEP_BY_KEY.get(k)?.titel ?? k;
  const offen = (s: { status: string }) => s.status === 'offen' || s.status === 'in_arbeit';
  const phase = agency.fulfillment_phase;

  // Fortschritt bis zum Kampagnenstart: alle Schritte der Aufbau-Phasen laut gebuchten Leistungen
  let fortschritt: { erledigt: number; gesamt: number } | null = null;
  if (phase && AUFBAU.includes(phase)) {
    const keys = new Set(AUFBAU.flatMap((p) => stepsForKunde(p, bausteine).map((d) => d.key)));
    const erledigt = steps.filter((s) => keys.has(s.step_key) && (s.status === 'erledigt' || s.status === 'nicht_noetig')).length;
    fortschritt = { erledigt, gesamt: keys.size };
  }

  let umsaetzeFehlen = false;
  if (phase === 'continuity' && einstellungen.length) {
    try {
      const [eintraege, kosten] = await Promise.all([ladeUmsaetze(svc, agencyId), ladeKosten(svc, agencyId)]);
      umsaetzeFehlen = berechneRoi({ einstellungen, eintraege, kosten, jetzt }).fehlend.length > 0;
    } catch {
      /* ROI ist Zusatz */
    }
  }

  let empfehlung: { titel: string; warum: string } | null = null;
  // Empfehlung lädt die Lage aller Kunden – nur für die E-Mail, nicht bei jedem Dashboard-Aufruf
  if (opts.mitEmpfehlung !== false) try {
    const { empfehlungen } = await ladeEmpfehlungen(svc, agencyId);
    const e = empfehlungen.find((x) => x.art === 'tipp') ?? empfehlungen[0];
    if (e?.titel) empfehlung = { titel: e.titel, warum: e.warum };
  } catch {
    /* Empfehlung ist Zusatz */
  }

  return berechneWochenbericht({
    firma: agency.name,
    vorname: (agency.contact_name ?? '').split(/\s+/)[0] || 'zusammen',
    phase,
    wirBearbeiten: Array.isArray(agency.bausteine) && agency.bausteine.includes('innendienst'),
    jetzt,
    kandidaten: ((kand ?? []) as Array<{ created_at: string; first_contact_at: string | null; erster_kontaktversuch_am: string | null; ttfc_seconds: number | null; current_stage_id: string | null; blacklisted: boolean | null }>)
      .filter((k) => !k.blacklisted)
      .map((k) => ({
        created_at: k.created_at,
        first_contact_at: k.first_contact_at,
        kontaktversuch_am: k.erster_kontaktversuch_am,
        ttfc_seconds: k.ttfc_seconds,
        eingang: !k.current_stage_id || stageTyp.get(k.current_stage_id) === 'new',
      })),
    anrufe: ((calls ?? []) as Array<{ created_at: string; result: string | null }>).map((c) => ({ created_at: c.created_at, erreicht: ERREICHT.includes(c.result ?? '') })),
    termine: [
      ...((alteTermine ?? []) as Array<{ scheduled_at: string; status: string | null }>).map((t) => ({ datum: t.scheduled_at, status: t.status })),
      ...((neueTermine ?? []) as Array<{ starts_at: string; status: string | null }>).map((t) => ({ datum: t.starts_at, status: t.status })),
    ],
    einstellungen: einstellungen.map((h) => h.eingestellt_am),
    geplant: { gespraeche: geplant.vorstellungsgespraeche, probetage: geplant.probetage },
    kundenAufgaben: steps.filter((s) => s.wer === 'kunde' && offen(s)).map((s) => ({ titel: titel(s.step_key), faellig_am: s.faellig_am })),
    wirErledigt: steps
      .filter((s) => s.wer === 'zoepp' && s.status === 'erledigt' && s.erledigt_am && s.erledigt_am >= vor7)
      .map((s) => titel(s.step_key)),
    wirAlsNaechstes: steps
      .filter((s) => s.wer === 'zoepp' && offen(s) && s.phase === phase)
      .sort((x, y) => (x.faellig_am ?? '9').localeCompare(y.faellig_am ?? '9'))
      .slice(0, 3)
      .map((s) => titel(s.step_key)),
    fortschritt,
    umsaetzeFehlen,
    empfehlung,
  });
}
