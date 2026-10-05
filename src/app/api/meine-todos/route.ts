import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadMyTodos, today } from '@/lib/fulfillment/views';
import { STEP_BY_KEY } from '@/lib/fulfillment/catalog';
import { agencyLogo } from '@/lib/branding/logo';
import { loadRechnungsliste } from '@/lib/billing/rechnungsliste';
import { mahnwesenAktiv, faelligerSchritt, type MahnFall } from '@/lib/billing/mahnwesen';

/** Meine Aufgaben: Fulfillment-Schritte + meine Ads (Idee, Material, Bearbeitung, Bereit zum Launch). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const svc = createAdminClient();

  const [schritte, { data: ads }] = await Promise.all([
    loadMyTodos(svc, user.id),
    svc
      .from('ad_items')
      .select('id, agency_id, titel, typ, stage, faellig_am, kunden_kommentar')
      .eq('assignee_id', user.id)
      .in('stage', ['idee', 'material', 'bearbeitung', 'bereit'])
      .order('faellig_am', { ascending: true }),
  ]);
  const agencyIds = [...new Set(((ads ?? []) as Array<{ agency_id: string }>).map((a) => a.agency_id))];
  const { data: agencies } = agencyIds.length
    ? await svc.from('agencies').select('id, name').in('id', agencyIds)
    : { data: [] };
  const names = new Map(((agencies ?? []) as Array<{ id: string; name: string }>).map((a) => [a.id, a.name]));

  // Buchhaltung: Zusammenfassung für die Funktion backoffice
  let buchhaltung: { rechnungen: number; mahnanrufe: number } | null = null;
  const { data: me } = await svc.from('users').select('funktion').eq('id', user.id).maybeSingle();
  if ((me as { funktion: string | null } | null)?.funktion === 'backoffice') {
    const heute = today();
    const { rechnungen } = await loadRechnungsliste(svc, heute.slice(0, 7));
    const { data: faelle } = await svc.from('dunning_cases').select('*').eq('status', 'offen');
    buchhaltung = {
      rechnungen: rechnungen.filter((z) => !z.geschrieben_am && z.faellig_am <= heute).length,
      mahnanrufe: mahnwesenAktiv() ? ((faelle ?? []) as MahnFall[]).filter((f) => faelligerSchritt(f, heute)).length : 0,
    };
  }

  // Weitere Aufgaben aus den bisherigen Systemen: Projekt-Aufgaben (Transkripte/manuell) + interne Tasks.
  // Eigene plus – für Admins – alle ohne Zuständigen.
  const istAdmin = user.role === 'admin';
  const [{ data: projekt }, { data: intern }] = await Promise.all([
    svc.from('project_tasks').select('id, agency_id, titel, status, faellig_am, owner_user_id')
      .in('status', ['offen', 'in_arbeit', 'blockiert', 'zur_freigabe']),
    svc.from('internal_tasks').select('id, agency_id, title, status, due_date, assigned_to')
      .in('status', ['backlog', 'todo', 'in_progress', 'review']),
  ]);
  const meins = (owner: string | null) => owner === user.id || (istAdmin && !owner);
  const weitereAgencyIds = [
    ...((projekt ?? []) as Array<{ agency_id: string | null }>).map((t) => t.agency_id),
    ...((intern ?? []) as Array<{ agency_id: string | null }>).map((t) => t.agency_id),
  ].filter((x): x is string => !!x && !names.has(x));
  if (weitereAgencyIds.length) {
    const { data: more } = await svc.from('agencies').select('id, name').in('id', [...new Set(weitereAgencyIds)]);
    for (const a of (more ?? []) as Array<{ id: string; name: string }>) names.set(a.id, a.name);
  }
  const weitere = [
    ...((projekt ?? []) as Array<{ id: string; agency_id: string | null; titel: string; status: string; faellig_am: string | null; owner_user_id: string | null }>)
      .filter((t) => meins(t.owner_user_id))
      .map((t) => ({
        quelle: 'projekt' as const, id: t.id, titel: t.titel, status: t.status, faellig_am: t.faellig_am,
        agency_name: t.agency_id ? names.get(t.agency_id) ?? null : null, link: `/aufgaben/${t.id}`, zugewiesen: !!t.owner_user_id,
      })),
    ...((intern ?? []) as Array<{ id: string; agency_id: string | null; title: string; status: string; due_date: string | null; assigned_to: string | null }>)
      .filter((t) => meins(t.assigned_to))
      .map((t) => ({
        quelle: 'intern' as const, id: t.id, titel: t.title, status: t.status, faellig_am: t.due_date,
        agency_name: t.agency_id ? names.get(t.agency_id) ?? null : null, link: '/tasks', zugewiesen: !!t.assigned_to,
      })),
  ].sort((a, b) => String(a.faellig_am ?? '9999').localeCompare(String(b.faellig_am ?? '9999')));

  // Zuletzt erledigt (7 Tage) – für die Erledigt-Spalte im Board
  const seit = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: stepsDone }, { data: projektDone }, { data: internDone }, { data: adsDone }] = await Promise.all([
    svc.from('client_steps').select('id, agency_id, step_key, erledigt_am').eq('owner_user_id', user.id).eq('status', 'erledigt').gte('erledigt_am', seit),
    svc.from('project_tasks').select('id, agency_id, titel, erledigt_am').eq('owner_user_id', user.id).eq('status', 'erledigt').gte('erledigt_am', seit),
    svc.from('internal_tasks').select('id, agency_id, title, updated_at').eq('assigned_to', user.id).eq('status', 'done').gte('updated_at', seit),
    svc.from('ad_items').select('id, agency_id, titel, live_am').eq('assignee_id', user.id).eq('stage', 'live').gte('live_am', seit),
  ]);
  type DoneRow = { id: string; agency_id: string | null; [k: string]: string | null };
  const doneRows = [
    ...((stepsDone ?? []) as DoneRow[]),
    ...((projektDone ?? []) as DoneRow[]),
    ...((internDone ?? []) as DoneRow[]),
    ...((adsDone ?? []) as DoneRow[]),
  ];
  const fehlend = [...new Set(doneRows.map((r) => r.agency_id).filter((x): x is string => !!x && !names.has(x)))];
  if (fehlend.length) {
    const { data: more } = await svc.from('agencies').select('id, name').in('id', fehlend);
    for (const a of (more ?? []) as Array<{ id: string; name: string }>) names.set(a.id, a.name);
  }
  const kunde = (id: string | null) => (id ? names.get(id) ?? null : null);
  const erledigt = [
    ...((stepsDone ?? []) as DoneRow[]).map((r) => ({
      quelle: 'schritt' as const, id: r.id, titel: STEP_BY_KEY.get(r.step_key ?? '')?.titel ?? 'Fulfillment-Schritt',
      agency_name: kunde(r.agency_id), am: r.erledigt_am, link: r.agency_id ? `/clients/${r.agency_id}/ablauf` : null,
    })),
    ...((projektDone ?? []) as DoneRow[]).map((r) => ({
      quelle: 'projekt' as const, id: r.id, titel: r.titel ?? 'Aufgabe', agency_name: kunde(r.agency_id), am: r.erledigt_am, link: `/aufgaben/${r.id}`,
    })),
    ...((internDone ?? []) as DoneRow[]).map((r) => ({
      quelle: 'intern' as const, id: r.id, titel: r.title ?? 'Aufgabe', agency_name: kunde(r.agency_id), am: r.updated_at, link: '/tasks',
    })),
    ...((adsDone ?? []) as DoneRow[]).map((r) => ({
      quelle: 'ad' as const, id: r.id, titel: r.titel ?? 'Ad', agency_name: kunde(r.agency_id), am: r.live_am, link: '/ads',
    })),
  ].sort((a, b) => String(b.am).localeCompare(String(a.am)));

  // Kunden-Logos (agencies.settings.logo_url) nach Kundenname für die Karten
  const logoIds = [...new Set([...names.keys(), ...schritte.map((s) => s.agency_id)])];
  const { data: logoRows } = logoIds.length
    ? await svc.from('agencies').select('name, settings').in('id', logoIds)
    : { data: [] };
  const logos: Record<string, string> = {};
  for (const a of (logoRows ?? []) as Array<{ name: string; settings: unknown }>) {
    const url = agencyLogo(a.settings);
    if (url) logos[a.name] = url;
  }

  return NextResponse.json({
    logos,
    erledigt,
    buchhaltung,
    weitere,
    schritte,
    ads: ((ads ?? []) as Array<{ agency_id: string }>).map((a) => ({ ...a, agency_name: names.get(a.agency_id) ?? '–' })),
  });
}
