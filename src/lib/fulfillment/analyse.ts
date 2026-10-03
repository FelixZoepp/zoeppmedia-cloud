/**
 * "Warum verzögern sich Starts?" — Zeit pro Schritt aufteilen: lag es an uns oder am Kunden?
 *
 * Zeit eines Schritts = von gestartet_am bis erledigt_am (offen: bis jetzt).
 * Zuordnung je Abschnitt laut Verlauf (client_step_log):
 *   - Status "zur_pruefung" → bei uns (wir müssen prüfen)
 *   - sonst → bei dem, der den Schritt erledigen muss (wer: kunde | zoepp)
 * Verspätung = Tage über der Frist (faellig_am).
 */

import { STEP_BY_KEY, type Phase } from './catalog';

const TAG = 86_400_000;

export interface StepZeit {
  step_key: string;
  agency_id: string;
  phase: Phase;
  wer: 'kunde' | 'zoepp';
  tage_kunde: number;
  tage_zoepp: number;
  tage_ueber_frist: number;
  offen: boolean;
}

interface StepIn {
  id: string;
  agency_id: string;
  step_key: string;
  phase: Phase;
  wer: 'kunde' | 'zoepp';
  status: string;
  gestartet_am: string;
  erledigt_am: string | null;
  faellig_am: string | null;
}
interface LogIn {
  step_id: string;
  nach_status: string;
  created_at: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function stepZeiten(steps: StepIn[], logs: LogIn[], now: Date = new Date()): StepZeit[] {
  const byStep = new Map<string, LogIn[]>();
  for (const l of logs) byStep.set(l.step_id, [...(byStep.get(l.step_id) ?? []), l]);

  return steps
    .filter((s) => s.status !== 'nicht_noetig')
    .map((s) => {
      const start = new Date(s.gestartet_am).getTime();
      const ende = s.erledigt_am ? new Date(s.erledigt_am).getTime() : now.getTime();
      const events = (byStep.get(s.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));

      let kunde = 0;
      let zoepp = 0;
      let t = start;
      let status = 'offen';
      const book = (bis: number) => {
        const dauer = Math.max(0, Math.min(bis, ende) - t);
        if (status === 'zur_pruefung' || s.wer === 'zoepp') zoepp += dauer;
        else kunde += dauer;
      };
      for (const e of events) {
        const at = new Date(e.created_at).getTime();
        if (at <= t) {
          status = e.nach_status;
          continue;
        }
        book(at);
        t = at;
        status = e.nach_status;
        if (status === 'erledigt' || status === 'nicht_noetig') break;
      }
      if (status !== 'erledigt' && status !== 'nicht_noetig') book(ende);

      const frist = s.faellig_am ? new Date(`${s.faellig_am}T23:59:59Z`).getTime() : null;
      return {
        step_key: s.step_key,
        agency_id: s.agency_id,
        phase: s.phase,
        wer: s.wer,
        tage_kunde: round1(kunde / TAG),
        tage_zoepp: round1(zoepp / TAG),
        tage_ueber_frist: frist ? round1(Math.max(0, ende - frist) / TAG) : 0,
        offen: !s.erledigt_am,
      };
    });
}

export interface KundenAnalyse {
  agency_id: string;
  tage_kunde: number;
  tage_zoepp: number;
  tage_ueber_frist: number;
  /** wer hat die meisten Verspätungstage verursacht? */
  bremse: 'kunde' | 'zoepp' | null;
  langsamste: Array<{ titel: string; wer: 'kunde' | 'zoepp'; tage_ueber_frist: number }>;
}

export function proKunde(zeiten: StepZeit[], phasen: Phase[] = ['zahlung', 'onboarding', 'setup']): KundenAnalyse[] {
  const agencies = [...new Set(zeiten.map((z) => z.agency_id))];
  return agencies.map((id) => {
    const z = zeiten.filter((x) => x.agency_id === id && phasen.includes(x.phase));
    const ueberKunde = z.filter((x) => x.wer === 'kunde').reduce((a, x) => a + x.tage_ueber_frist, 0);
    const ueberZoepp = z.filter((x) => x.wer === 'zoepp').reduce((a, x) => a + x.tage_ueber_frist, 0);
    return {
      agency_id: id,
      tage_kunde: round1(z.reduce((a, x) => a + x.tage_kunde, 0)),
      tage_zoepp: round1(z.reduce((a, x) => a + x.tage_zoepp, 0)),
      tage_ueber_frist: round1(ueberKunde + ueberZoepp),
      bremse: ueberKunde === 0 && ueberZoepp === 0 ? null : ueberKunde >= ueberZoepp ? 'kunde' : 'zoepp',
      langsamste: z
        .filter((x) => x.tage_ueber_frist > 0)
        .sort((a, b) => b.tage_ueber_frist - a.tage_ueber_frist)
        .slice(0, 3)
        .map((x) => ({ titel: STEP_BY_KEY.get(x.step_key)?.titel ?? x.step_key, wer: x.wer, tage_ueber_frist: x.tage_ueber_frist })),
    };
  });
}

export interface SchrittAnalyse {
  step_key: string;
  titel: string;
  wer: 'kunde' | 'zoepp';
  anzahl: number;
  davon_verspaetet: number;
  schnitt_ueber_frist: number;
}

/** Über alle Kunden: welche Schritte bremsen am häufigsten? */
export function bremsendeSchritte(zeiten: StepZeit[]): SchrittAnalyse[] {
  const keys = [...new Set(zeiten.map((z) => z.step_key))];
  return keys
    .map((k) => {
      const z = zeiten.filter((x) => x.step_key === k);
      const spaet = z.filter((x) => x.tage_ueber_frist > 0);
      return {
        step_key: k,
        titel: STEP_BY_KEY.get(k)?.titel ?? k,
        wer: z[0].wer,
        anzahl: z.length,
        davon_verspaetet: spaet.length,
        schnitt_ueber_frist: spaet.length ? round1(spaet.reduce((a, x) => a + x.tage_ueber_frist, 0) / spaet.length) : 0,
      };
    })
    .filter((s) => s.davon_verspaetet > 0)
    .sort((a, b) => b.davon_verspaetet * b.schnitt_ueber_frist - a.davon_verspaetet * a.schnitt_ueber_frist);
}
