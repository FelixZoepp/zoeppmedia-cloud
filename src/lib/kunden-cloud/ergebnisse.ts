import type { SupabaseClient } from '@supabase/supabase-js';
import { agencyLogo } from '@/lib/branding/logo';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';

/**
 * Kunden-Ergebnisse für Kundenberater: pro Kunde die wichtigsten Recruiting-Zahlen der
 * letzten 30 Tage – ohne in die Cloud des Kunden gehen zu müssen.
 */

export type Ampel = 'gruen' | 'gelb' | 'rot';

export interface KundeErgebnis {
  id: string;
  name: string;
  logo_url: string | null;
  phase: string | null;
  pausiert: boolean;
  csm_user_id: string | null;
  /** neue Bewerber letzte 30 Tage / die 30 Tage davor */
  bewerber30: number;
  bewerberVorher: number;
  bewerber7: number;
  /** Anteil der neuen Bewerber (30 T.) mit erstem Kontakt */
  kontaktquote: number | null;
  /** Ø Minuten bis zum ersten Kontakt */
  speedToLeadMin: number | null;
  anrufe30: number;
  erreichbarkeit: number | null;
  termine30: number;
  noShows30: number;
  einstellungen30: number;
  ampel: Ampel;
  hinweise: string[];
}

type Kandidat = { agency_id: string; created_at: string; first_contact_at: string | null; ttfc_seconds: number | null; eingestellt_am: string | null };
type Anruf = { agency_id: string; result: string | null; created_at: string };
type Termin = { agency_id: string; status: string | null; datum: string };

const ERREICHT = ['termin_vereinbart', 'kein_interesse', 'rueckruf', 'sonstiges'];
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export function berechneErgebnisse(
  agencies: Array<{ id: string; name: string; settings: unknown; fulfillment_phase: string | null; pausiert_grund: string | null; csm_user_id: string | null }>,
  kandidaten: Kandidat[],
  anrufe: Anruf[],
  termine: Termin[],
  jetzt: Date,
): KundeErgebnis[] {
  const t = (tage: number) => new Date(jetzt.getTime() - tage * 864e5).toISOString();
  const vor7 = t(7);
  const vor30 = t(30);
  const vor60 = t(60);
  const jetztIso = jetzt.toISOString();
  const rang: Record<Ampel, number> = { rot: 0, gelb: 1, gruen: 2 };

  return agencies
    .map((a) => {
      const k = kandidaten.filter((x) => x.agency_id === a.id);
      const neu30 = k.filter((x) => x.created_at >= vor30);
      const vorher = k.filter((x) => x.created_at >= vor60 && x.created_at < vor30).length;
      const neu7 = k.filter((x) => x.created_at >= vor7).length;
      const kontaktiert = neu30.filter((x) => x.first_contact_at).length;
      const ttfc = neu30.map((x) => x.ttfc_seconds).filter((s): s is number => typeof s === 'number' && s >= 0);
      const calls = anrufe.filter((x) => x.agency_id === a.id && x.created_at >= vor30);
      const erreicht = calls.filter((x) => ERREICHT.includes(x.result ?? '')).length;
      const tm = termine.filter((x) => x.agency_id === a.id && x.datum >= vor30 && x.datum <= jetztIso);
      const noShows = tm.filter((x) => x.status === 'no_show').length;
      const termine30 = tm.filter((x) => x.status !== 'abgesagt' && x.status !== 'cancelled').length;
      const einstellungen = k.filter((x) => x.eingestellt_am && x.eingestellt_am >= vor30).length;
      const kontaktquote = pct(kontaktiert, neu30.length);
      const laeuft = a.fulfillment_phase === 'continuity' && !a.pausiert_grund;

      // Ampel + Hinweise in Klartext für den Kundenberater
      const hinweise: string[] = [];
      let ampel: Ampel = 'gruen';
      const rot = (h: string) => ((ampel = 'rot'), hinweise.push(h));
      const gelb = (h: string) => (ampel !== 'rot' && (ampel = 'gelb'), hinweise.push(h));
      if (laeuft && neu7 === 0) rot('Kampagne läuft, aber 7 Tage keine neuen Bewerber');
      if (neu30.length >= 5 && kontaktquote !== null && kontaktquote < 50) rot(`Nur ${kontaktquote} % der neuen Bewerber kontaktiert`);
      else if (neu30.length >= 5 && kontaktquote !== null && kontaktquote < 80) gelb(`${kontaktquote} % der neuen Bewerber kontaktiert`);
      if (vorher >= 5 && neu30.length < vorher * 0.5) gelb(`Bewerber halbiert: ${neu30.length} statt ${vorher}`);
      if (termine30 >= 3 && noShows / termine30 > 0.3) gelb(`Hohe No-Show-Quote (${noShows} von ${termine30})`);
      if (laeuft && neu30.length >= 10 && termine30 === 0) gelb('Viele Bewerber, aber keine Termine');

      return {
        id: a.id,
        name: a.name,
        logo_url: agencyLogo(a.settings),
        phase: a.fulfillment_phase,
        pausiert: !!a.pausiert_grund,
        csm_user_id: a.csm_user_id,
        bewerber30: neu30.length,
        bewerberVorher: vorher,
        bewerber7: neu7,
        kontaktquote,
        speedToLeadMin: ttfc.length ? Math.round(ttfc.reduce((s, x) => s + x, 0) / ttfc.length / 60) : null,
        anrufe30: calls.length,
        erreichbarkeit: pct(erreicht, calls.length),
        termine30,
        noShows30: noShows,
        einstellungen30: einstellungen,
        ampel,
        hinweise,
      };
    })
    .sort((x, y) => Number(x.pausiert) - Number(y.pausiert) || rang[x.ampel] - rang[y.ampel] || y.bewerber30 - x.bewerber30);
}

/** Alle Seiten einer Abfrage laden (max. 1000 je Abruf) */
async function alle<T>(q: (von: number, bis: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let von = 0; von < 50_000; von += 1000) {
    const { data, error } = await q(von, von + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function ladeErgebnisse(svc: SupabaseClient, jetzt: Date = new Date()): Promise<KundeErgebnis[]> {
  const vor60 = new Date(jetzt.getTime() - 60 * 864e5).toISOString();
  const vor30 = new Date(jetzt.getTime() - 30 * 864e5).toISOString();

  const [{ data: ags }, kandidaten, anrufe, alteTermine, neueTermine] = await Promise.all([
    svc
      .from('agencies')
      .select('id, name, settings, fulfillment_phase, pausiert_grund, csm_user_id')
      .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`)
      .order('name'),
    alle<Kandidat>((a, b) =>
      svc
        .from('candidates')
        .select('agency_id, created_at, first_contact_at, ttfc_seconds, eingestellt_am')
        .is('deleted_at', null)
        .or(`created_at.gte.${vor60},eingestellt_am.gte.${vor30}`)
        .order('created_at')
        .range(a, b),
    ),
    alle<Anruf>((a, b) => svc.from('call_logs').select('agency_id, result, created_at').gte('created_at', vor30).order('created_at').range(a, b)),
    alle<{ agency_id: string; status: string | null; scheduled_at: string }>((a, b) =>
      svc.from('candidate_appointments').select('agency_id, status, scheduled_at').gte('scheduled_at', vor30).order('scheduled_at').range(a, b),
    ),
    alle<{ agency_id: string; status: string | null; starts_at: string }>((a, b) =>
      svc.from('appointments').select('agency_id, status, starts_at').gte('starts_at', vor30).order('starts_at').range(a, b),
    ),
  ]);

  return berechneErgebnisse(
    ((ags ?? []) as Parameters<typeof berechneErgebnisse>[0]).filter((a) => a.fulfillment_phase !== 'beendet'),
    kandidaten,
    anrufe,
    [
      ...alteTermine.map((x) => ({ agency_id: x.agency_id, status: x.status, datum: x.scheduled_at })),
      ...neueTermine.map((x) => ({ agency_id: x.agency_id, status: x.status, datum: x.starts_at })),
    ],
    jetzt,
  );
}
