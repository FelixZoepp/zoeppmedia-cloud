/**
 * Kalender der Kunden-Cloud: Termine aus beiden Systemen zusammenführen.
 * - candidate_appointments: Vorstellungsgespräch / Probetag, vom Team angelegt
 * - appointments: neues Modell (Bewerbung + Buchungslink)
 */

export type TerminQuelle = 'kandidat' | 'bewerbung';
export type TerminStatus = 'geplant' | 'erschienen' | 'no_show' | 'abgesagt';

export interface Termin {
  id: string;
  quelle: TerminQuelle;
  typ: string;
  typLabel: string;
  start: string;
  ende: string;
  status: TerminStatus;
  candidate_id: string | null;
  candidate_name: string;
  ort: string | null;
  notizen: string | null;
  /** Status lässt sich im Kalender ändern (nur Team-Termine) */
  bearbeitbar: boolean;
}

export const TYP_LABEL: Record<string, string> = {
  vorstellungsgespraech: 'Vorstellungsgespräch',
  probetag: 'Probetag',
  erstgespraech: 'Erstgespräch',
  termin: 'Erstgespräch',
  interview: 'Vorstellungsgespräch',
  call: 'Telefonat',
};

/** Standarddauer je Typ in Minuten (candidate_appointments hat kein Ende) */
export const DAUER_MIN: Record<string, number> = {
  vorstellungsgespraech: 45,
  probetag: 480,
  erstgespraech: 15,
  termin: 15,
};

export const STATUS_LABEL: Record<TerminStatus, string> = {
  geplant: 'Geplant',
  erschienen: 'Erschienen',
  no_show: 'No-Show',
  abgesagt: 'Abgesagt',
};

function typLabel(typ: string): string {
  return TYP_LABEL[typ] ?? (typ ? typ.charAt(0).toUpperCase() + typ.slice(1).replace(/_/g, ' ') : 'Termin');
}

/** Status des neuen Modells auf die vier Kalender-Status abbilden */
export function mapStatus(raw: string | null | undefined): TerminStatus {
  const s = (raw ?? '').toLowerCase();
  if (['erschienen', 'stattgefunden', 'attended', 'completed', 'done'].includes(s)) return 'erschienen';
  if (['no_show', 'noshow', 'no-show', 'nicht_erschienen'].includes(s)) return 'no_show';
  if (['abgesagt', 'cancelled', 'canceled', 'storniert'].includes(s)) return 'abgesagt';
  return 'geplant';
}

const plusMin = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60_000).toISOString();

export interface CandidateAppointmentRow {
  id: string;
  candidate_id: string;
  type: string;
  scheduled_at: string;
  status: string | null;
  notes: string | null;
}

export interface AppointmentRow {
  id: string;
  application_id: string | null;
  starts_at: string;
  ends_at: string | null;
  type: string | null;
  location: string | null;
  status: string | null;
}

export function normalizeTermine(
  kandidat: CandidateAppointmentRow[],
  bewerbung: AppointmentRow[],
  namen: Map<string, string>,
  bewerbungZuKandidat: Map<string, string>,
): Termin[] {
  const a: Termin[] = kandidat.map((r) => ({
    id: r.id,
    quelle: 'kandidat',
    typ: r.type,
    typLabel: typLabel(r.type),
    start: r.scheduled_at,
    ende: plusMin(r.scheduled_at, DAUER_MIN[r.type] ?? 30),
    status: mapStatus(r.status),
    candidate_id: r.candidate_id,
    candidate_name: namen.get(r.candidate_id) ?? 'Bewerber',
    ort: null,
    notizen: r.notes,
    bearbeitbar: true,
  }));
  const b: Termin[] = bewerbung.map((r) => {
    const cid = r.application_id ? bewerbungZuKandidat.get(r.application_id) ?? null : null;
    const typ = r.type ?? 'termin';
    return {
      id: r.id,
      quelle: 'bewerbung',
      typ,
      typLabel: typLabel(typ),
      start: r.starts_at,
      ende: r.ends_at ?? plusMin(r.starts_at, DAUER_MIN[typ] ?? 30),
      status: mapStatus(r.status),
      candidate_id: cid,
      candidate_name: (cid && namen.get(cid)) || 'Bewerber',
      ort: r.location,
      notizen: null,
      bearbeitbar: false,
    };
  });
  return [...a, ...b].sort((x, y) => x.start.localeCompare(y.start) || x.candidate_name.localeCompare(y.candidate_name, 'de'));
}

/* ── Datum-Helfer für die Wochenansicht (lokale Zeit) ─────────── */

/** Montag 00:00 der Woche, in der `d` liegt */
export function wochenStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wt = (x.getDay() + 6) % 7; // Mo = 0
  x.setDate(x.getDate() - wt);
  return x;
}

export function addTage(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** YYYY-MM-DD in lokaler Zeit */
export function isoTag(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Position eines Termins im Tagesraster (Prozent von oben/Höhe), auf das sichtbare Fenster begrenzt */
export function rasterPosition(start: string, ende: string, vonStunde: number, bisStunde: number): { top: number; height: number } | null {
  const s = new Date(start);
  const e = new Date(ende);
  const minuten = (d: Date) => d.getHours() * 60 + d.getMinutes();
  const fensterVon = vonStunde * 60;
  const fensterBis = bisStunde * 60;
  const a = Math.max(fensterVon, minuten(s));
  // Termine über Mitternacht (oder ganztägig) enden im Raster am Tagesende
  const b = Math.min(fensterBis, e.toDateString() !== s.toDateString() ? fensterBis : minuten(e));
  if (b <= fensterVon || a >= fensterBis) return null;
  const spanne = fensterBis - fensterVon;
  return { top: ((a - fensterVon) / spanne) * 100, height: Math.max(((b - a) / spanne) * 100, 4) };
}
