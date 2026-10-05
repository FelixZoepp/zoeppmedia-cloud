import type { SupabaseClient } from '@supabase/supabase-js';

/** Ab so vielen offenen Aufgaben (überfällige zählen doppelt) gilt jemand als voll ausgelastet. */
export const KAPAZITAET = 20;

export interface MemberWorkload {
  user_id: string;
  name: string;
  email: string;
  position: string | null;
  funktion: string | null;
  role: 'admin' | 'employee';
  last_login: string | null;
  avatar_url: string | null;
  offen: number;
  ueberfaellig: number;
  erledigt_30d: number;
  /** 0–100 (gedeckelt) */
  workload: number;
  /** Aufschlüsselung der offenen Aufgaben nach Quelle */
  quellen: { schritte: number; ads: number; projekt: number; intern: number };
}

type Item = { owner: string | null; faellig: string | null };
type Done = { owner: string | null; am: string | null };

/** Reine Rechnung – getrennt vom Laden, damit testbar. */
export function computeWorkload(
  users: Array<{ id: string; name: string; email: string; position: string | null; funktion: string | null; role: string; last_login: string | null; avatar_url?: string | null }>,
  offen: { schritte: Item[]; ads: Item[]; projekt: Item[]; intern: Item[] },
  erledigt: Done[],
  heute: string,
  seit: string,
): MemberWorkload[] {
  return users.map((u) => {
    const mine = (list: Item[]) => list.filter((i) => i.owner === u.id);
    const quellen = {
      schritte: mine(offen.schritte).length,
      ads: mine(offen.ads).length,
      projekt: mine(offen.projekt).length,
      intern: mine(offen.intern).length,
    };
    const alle = [...mine(offen.schritte), ...mine(offen.ads), ...mine(offen.projekt), ...mine(offen.intern)];
    const ueberfaellig = alle.filter((i) => i.faellig && i.faellig < heute).length;
    const anzahl = alle.length;
    const erledigt_30d = erledigt.filter((d) => d.owner === u.id && d.am && d.am >= seit).length;
    return {
      user_id: u.id,
      name: u.name,
      email: u.email,
      position: u.position,
      funktion: u.funktion,
      role: u.role === 'admin' ? 'admin' : 'employee',
      last_login: u.last_login,
      avatar_url: u.avatar_url ?? null,
      offen: anzahl,
      ueberfaellig,
      erledigt_30d,
      workload: Math.min(100, Math.round(((anzahl + ueberfaellig) / KAPAZITAET) * 100)),
      quellen,
    };
  });
}

export async function loadTeamWorkload(svc: SupabaseClient, now: Date = new Date()): Promise<MemberWorkload[]> {
  const heute = now.toISOString().slice(0, 10);
  const seitDate = new Date(now.getTime() - 30 * 864e5);
  const seit = seitDate.toISOString();

  const [users, schritte, ads, projekt, intern, schritteDone, adsDone, projektDone, internDone] = await Promise.all([
    svc.from('users').select('id, name, email, position, funktion, role, last_login, aktiv, avatar_url').in('role', ['admin', 'employee']).order('name'),
    svc.from('client_steps').select('owner_user_id, faellig_am, wer, status').in('status', ['offen', 'in_arbeit', 'zur_pruefung']),
    svc.from('ad_items').select('assignee_id, faellig_am').in('stage', ['idee', 'material', 'bearbeitung', 'bereit']),
    svc.from('project_tasks').select('owner_user_id, faellig_am').in('status', ['offen', 'in_arbeit', 'blockiert', 'zur_freigabe']),
    svc.from('internal_tasks').select('assigned_to, due_date').in('status', ['backlog', 'todo', 'in_progress', 'review']),
    svc.from('client_steps').select('owner_user_id, erledigt_am').eq('status', 'erledigt').gte('erledigt_am', seit),
    svc.from('ad_items').select('assignee_id, live_am').eq('stage', 'live').gte('live_am', seit),
    svc.from('project_tasks').select('owner_user_id, erledigt_am').eq('status', 'erledigt').gte('erledigt_am', seit),
    svc.from('internal_tasks').select('assigned_to, updated_at').eq('status', 'done').gte('updated_at', seit),
  ]);

  type Row = Record<string, string | null>;
  const rows = (r: { data: unknown }) => (r.data ?? []) as Row[];
  const activeUsers = rows(users).filter((u) => (u as unknown as { aktiv: boolean | null }).aktiv !== false);

  return computeWorkload(
    activeUsers as never,
    {
      // Kunden-Schritte zählen nur, wenn wir dran sind (oder prüfen müssen)
      schritte: rows(schritte)
        .filter((r) => r.wer === 'zoepp' || r.status === 'zur_pruefung')
        .map((r) => ({ owner: r.owner_user_id, faellig: r.faellig_am })),
      ads: rows(ads).map((r) => ({ owner: r.assignee_id, faellig: r.faellig_am })),
      projekt: rows(projekt).map((r) => ({ owner: r.owner_user_id, faellig: r.faellig_am })),
      intern: rows(intern).map((r) => ({ owner: r.assigned_to, faellig: r.due_date })),
    },
    [
      ...rows(schritteDone).map((r) => ({ owner: r.owner_user_id, am: r.erledigt_am })),
      ...rows(adsDone).map((r) => ({ owner: r.assignee_id, am: r.live_am })),
      ...rows(projektDone).map((r) => ({ owner: r.owner_user_id, am: r.erledigt_am })),
      ...rows(internDone).map((r) => ({ owner: r.assigned_to, am: r.updated_at })),
    ],
    heute,
    seit,
  );
}
