/**
 * Schnell-Absage: Bewerber mit einem Klick absagen – ohne Grund, ohne Nachricht an den Bewerber.
 * Reine Helfer (welche Jobs abbrechen, Rückgängig-Daten), damit sie testbar bleiben.
 */

export const SCHNELL_ABSAGE_GRUND = 'Passt nicht';
export const SCHNELL_ABSAGE_ART = 'schnell_absage';

/** Phase „Abgesagt“: über stage_type, bei Altdaten ohne Typ über den Namen */
export function istAbgesagtStage(s: { name?: string | null; stage_type?: string | null } | null | undefined): boolean {
  if (!s) return false;
  return s.stage_type === 'rejected' || /^abgesagt/i.test(s.name ?? '');
}

/** Jobs, die den Bewerber nicht anschreiben und weiterlaufen dürfen (Medien, Zustellstatus, Eingang) */
const NICHT_ABBRECHEN = new Set(['media.download', 'whatsapp.status', 'whatsapp.inbound']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nurUuids = (ids: Array<string | null | undefined>) => [...new Set(ids.filter((x): x is string => !!x && UUID.test(x)))];

export interface AbsageBezug {
  candidateId: string;
  conversationIds: string[];
  applicationIds: string[];
  appointmentIds: string[];
}

/** PostgREST-„or“-Filter: alle Jobs, deren Payload auf Bewerber, Gespräch, Bewerbung oder Termin zeigt */
export function jobFilterOr(b: AbsageBezug): string {
  const teile = [`payload->>candidate_id.eq.${nurUuids([b.candidateId])[0] ?? '00000000-0000-0000-0000-000000000000'}`];
  const conv = nurUuids(b.conversationIds);
  const apps = nurUuids(b.applicationIds);
  const termine = nurUuids(b.appointmentIds);
  if (conv.length) {
    teile.push(`payload->>conversation_id.in.(${conv.join(',')})`);
    // bot.textnachricht speichert camelCase
    teile.push(`payload->>conversationId.in.(${conv.join(',')})`);
  }
  if (apps.length) teile.push(`payload->>application_id.in.(${apps.join(',')})`);
  if (termine.length) teile.push(`payload->>appointment_id.in.(${termine.join(',')})`);
  return teile.join(',');
}

/** Gegenprüfung im Code: gehört der Job wirklich zu diesem Bewerber und darf er abgebrochen werden? */
export function sollJobAbbrechen(job: { type: string; payload: unknown }, b: AbsageBezug): boolean {
  if (NICHT_ABBRECHEN.has(job.type)) return false;
  const p = (job.payload && typeof job.payload === 'object' ? job.payload : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  if (str(p.candidate_id) === b.candidateId) return true;
  const conv = str(p.conversation_id) ?? str(p.conversationId);
  if (conv && b.conversationIds.includes(conv)) return true;
  const app = str(p.application_id);
  if (app && b.applicationIds.includes(app)) return true;
  const termin = str(p.appointment_id);
  if (termin && b.appointmentIds.includes(termin)) return true;
  return false;
}

const GESPRAECH_STATES = ['bot_active', 'human_active', 'waiting', 'closed'];
const BEWERBUNG_STATUS = ['open', 'hired', 'rejected', 'withdrawn', 'not_reached'];
const TERMIN_STATUS = ['geplant', 'erschienen', 'no_show', 'abgesagt'];
const EINLADUNG_STATUS = ['proposed', 'booked', 'confirmed', 'no_show', 'done', 'cancelled'];

/** Alles, was zum Rückgängigmachen nötig ist (geht an die Oberfläche und ins Aktivitätsprotokoll) */
export interface AbsageUndo {
  vorherStageId: string | null;
  /** Absagegrund wurde von uns gesetzt → beim Rückgängigmachen wieder leeren */
  grundGesetzt: boolean;
  bewerbungen: Array<{ id: string; stage_id: string | null; status: string }>;
  gespraeche: Array<{ id: string; state: string }>;
  /** candidate_appointments (Vorstellungsgespräch/Probetag) */
  termine: Array<{ id: string; status: string }>;
  /** appointments (gebuchte Termine aus dem Bot-Flow) */
  einladungen: Array<{ id: string; status: string }>;
}

export function baueUndo(args: {
  vorherStageId: string | null;
  grundGesetzt: boolean;
  bewerbungen: Array<{ id: string; stage_id: string | null; status: string | null }>;
  gespraeche: Array<{ id: string; state: string | null }>;
  termine: Array<{ id: string; status: string | null }>;
  einladungen: Array<{ id: string; status: string | null }>;
}): AbsageUndo {
  return {
    vorherStageId: args.vorherStageId,
    grundGesetzt: args.grundGesetzt,
    bewerbungen: args.bewerbungen.map((a) => ({ id: a.id, stage_id: a.stage_id, status: a.status ?? 'open' })),
    // Bereits geschlossene Gespräche bleiben zu – nur offene merken
    gespraeche: args.gespraeche.filter((g) => g.state && g.state !== 'closed').map((g) => ({ id: g.id, state: g.state as string })),
    termine: args.termine.map((t) => ({ id: t.id, status: t.status ?? 'geplant' })),
    einladungen: args.einladungen.map((t) => ({ id: t.id, status: t.status ?? 'booked' })),
  };
}

function liste<T>(v: unknown, pruefe: (x: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    const r = pruefe(x as Record<string, unknown>);
    return r ? [r] : [];
  });
}
const uuidOderNull = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);
const ausListe = (v: unknown, erlaubt: string[]) => (typeof v === 'string' && erlaubt.includes(v) ? v : null);

/** Rückgängig-Daten aus Request/Protokoll prüfen – unbekannte IDs/Status fliegen raus */
export function pruefeUndo(raw: unknown): AbsageUndo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const vorherStageId = uuidOderNull(r.vorherStageId);
  if (r.vorherStageId != null && !vorherStageId) return null;
  return {
    vorherStageId,
    grundGesetzt: r.grundGesetzt === true,
    bewerbungen: liste(r.bewerbungen, (x) => {
      const id = uuidOderNull(x.id);
      const status = ausListe(x.status, BEWERBUNG_STATUS);
      return id && status ? { id, stage_id: uuidOderNull(x.stage_id), status } : null;
    }),
    gespraeche: liste(r.gespraeche, (x) => {
      const id = uuidOderNull(x.id);
      const state = ausListe(x.state, GESPRAECH_STATES);
      return id && state ? { id, state } : null;
    }),
    termine: liste(r.termine, (x) => {
      const id = uuidOderNull(x.id);
      const status = ausListe(x.status, TERMIN_STATUS);
      return id && status ? { id, status } : null;
    }),
    einladungen: liste(r.einladungen, (x) => {
      const id = uuidOderNull(x.id);
      const status = ausListe(x.status, EINLADUNG_STATUS);
      return id && status ? { id, status } : null;
    }),
  };
}

/** Body fürs Rückgängigmachen: nur vorherStageId mitgeschickt → Rest aus dem Protokoll ergänzen */
export function mitProtokoll(body: AbsageUndo | null, protokoll: AbsageUndo | null): AbsageUndo | null {
  if (!body) return protokoll;
  if (!protokoll) return body;
  const leer = !body.bewerbungen.length && !body.gespraeche.length && !body.termine.length && !body.einladungen.length;
  return leer ? { ...protokoll, vorherStageId: body.vorherStageId ?? protokoll.vorherStageId } : body;
}
