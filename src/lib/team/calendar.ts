import type { SupabaseClient } from '@supabase/supabase-js';
import { STEP_BY_KEY } from '@/lib/fulfillment/catalog';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';

export type CalendarKind = 'termin' | 'schritt' | 'ad' | 'projekt' | 'intern';

export interface CalendarEntry {
  id: string;
  kind: CalendarKind;
  titel: string;
  /** YYYY-MM-DD */
  tag: string;
  /** ISO-Zeitpunkt bei Terminen, sonst null (ganztägige Frist) */
  start: string | null;
  ende: string | null;
  untertitel: string | null;
  personen: Array<{ id: string; name: string; avatar_url: string | null }>;
  href: string | null;
  ueberfaellig: boolean;
}

/** Lokales Datum (Europe/Berlin) als YYYY-MM-DD */
export function berlinDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

type Row = Record<string, string | null>;

/** Reine Zusammenführung – getrennt vom Laden, damit testbar. */
export function buildCalendar(
  input: {
    termine: Row[];
    schritte: Row[];
    ads: Row[];
    projekt: Row[];
    intern: Row[];
  },
  users: Map<string, { name: string; avatar_url: string | null }>,
  agencies: Map<string, string>,
  heute: string,
): CalendarEntry[] {
  const person = (id: string | null) => (id && users.has(id) ? [{ id, ...users.get(id)! }] : []);
  const kunde = (id: string | null) => (id ? agencies.get(id) ?? null : null);
  const frist = (tag: string | null) => !!tag && tag < heute;

  const out: CalendarEntry[] = [];
  for (const t of input.termine) {
    if (!t.start_time) continue;
    const sales = t.agency_id === SALES_AGENCY_ID;
    out.push({
      id: `termin-${t.id}`,
      kind: 'termin',
      titel: t.event_name || t.event_type || 'Termin',
      tag: berlinDay(t.start_time),
      start: t.start_time,
      ende: t.end_time,
      untertitel: [t.invitee_name, sales ? 'Sales' : kunde(t.agency_id)].filter(Boolean).join(' · ') || null,
      personen: [],
      href: t.candidate_id && !sales ? `/candidates/${t.candidate_id}` : null,
      ueberfaellig: false,
    });
  }
  for (const s of input.schritte) {
    if (!s.faellig_am || !s.agency_id) continue;
    out.push({
      id: `schritt-${s.id}`,
      kind: 'schritt',
      titel: STEP_BY_KEY.get(s.step_key ?? '')?.titel ?? 'Fulfillment-Schritt',
      tag: s.faellig_am,
      start: null,
      ende: null,
      untertitel: kunde(s.agency_id),
      personen: person(s.owner_user_id),
      href: `/clients/${s.agency_id}/ablauf`,
      ueberfaellig: frist(s.faellig_am),
    });
  }
  for (const a of input.ads) {
    if (!a.faellig_am) continue;
    out.push({
      id: `ad-${a.id}`,
      kind: 'ad',
      titel: a.titel || 'Ad',
      tag: a.faellig_am,
      start: null,
      ende: null,
      untertitel: kunde(a.agency_id),
      personen: person(a.assignee_id),
      href: '/ads',
      ueberfaellig: frist(a.faellig_am),
    });
  }
  for (const p of input.projekt) {
    if (!p.faellig_am) continue;
    out.push({
      id: `projekt-${p.id}`,
      kind: 'projekt',
      titel: p.titel || 'Aufgabe',
      tag: p.faellig_am,
      start: null,
      ende: null,
      untertitel: kunde(p.agency_id),
      personen: person(p.owner_user_id),
      href: `/aufgaben/${p.id}`,
      ueberfaellig: frist(p.faellig_am),
    });
  }
  for (const i of input.intern) {
    if (!i.due_date) continue;
    out.push({
      id: `intern-${i.id}`,
      kind: 'intern',
      titel: i.title || 'Interne Aufgabe',
      tag: i.due_date,
      start: null,
      ende: null,
      untertitel: kunde(i.agency_id),
      personen: person(i.assigned_to),
      href: '/tasks',
      ueberfaellig: frist(i.due_date),
    });
  }
  // Termine mit Uhrzeit zuerst, dann Fristen
  return out.sort((a, b) => a.tag.localeCompare(b.tag) || String(a.start ?? 'z').localeCompare(String(b.start ?? 'z')));
}

/** Alle Termine und offenen Fristen des Teams im Zeitraum [von, bis] (YYYY-MM-DD). */
export async function loadTeamCalendar(svc: SupabaseClient, von: string, bis: string, now: Date = new Date()): Promise<CalendarEntry[]> {
  // Termine: Zeitzone großzügig abdecken, Tag wird danach in Berlin-Zeit bestimmt
  const startIso = new Date(`${von}T00:00:00Z`).getTime() - 864e5;
  const endIso = new Date(`${bis}T23:59:59Z`).getTime() + 864e5;

  const [termine, schritte, ads, projekt, intern, users] = await Promise.all([
    svc.from('calendly_events').select('id, agency_id, candidate_id, event_name, event_type, start_time, end_time, invitee_name, status')
      .eq('status', 'scheduled').gte('start_time', new Date(startIso).toISOString()).lte('start_time', new Date(endIso).toISOString()),
    svc.from('client_steps').select('id, agency_id, step_key, owner_user_id, faellig_am, wer, status')
      .in('status', ['offen', 'in_arbeit', 'zur_pruefung']).gte('faellig_am', von).lte('faellig_am', bis),
    svc.from('ad_items').select('id, agency_id, titel, assignee_id, faellig_am')
      .in('stage', ['idee', 'material', 'bearbeitung', 'bereit']).gte('faellig_am', von).lte('faellig_am', bis),
    svc.from('project_tasks').select('id, agency_id, titel, owner_user_id, faellig_am')
      .in('status', ['offen', 'in_arbeit', 'blockiert', 'zur_freigabe']).gte('faellig_am', von).lte('faellig_am', bis),
    svc.from('internal_tasks').select('id, agency_id, title, assigned_to, due_date')
      .in('status', ['backlog', 'todo', 'in_progress', 'review']).gte('due_date', von).lte('due_date', bis),
    svc.from('users').select('id, name, avatar_url').in('role', ['admin', 'employee']),
  ]);
  const rows = (r: { data: unknown }) => (r.data ?? []) as Row[];

  // Kunden-Schritte nur, wenn wir dran sind (oder prüfen müssen)
  const meineSchritte = rows(schritte).filter((s) => s.wer === 'zoepp' || s.status === 'zur_pruefung');
  const agencyIds = [
    ...new Set(
      [...rows(termine), ...meineSchritte, ...rows(ads), ...rows(projekt), ...rows(intern)]
        .map((r) => r.agency_id)
        .filter((x): x is string => !!x),
    ),
  ];
  const { data: agencies } = agencyIds.length ? await svc.from('agencies').select('id, name').in('id', agencyIds) : { data: [] };

  return buildCalendar(
    { termine: rows(termine), schritte: meineSchritte, ads: rows(ads), projekt: rows(projekt), intern: rows(intern) },
    new Map(rows(users).map((u) => [u.id!, { name: u.name ?? '', avatar_url: u.avatar_url ?? null }])),
    new Map(((agencies ?? []) as Row[]).map((a) => [a.id!, a.name ?? ''])),
    now.toISOString().slice(0, 10),
  ).filter((e) => e.tag >= von && e.tag <= bis);
}
