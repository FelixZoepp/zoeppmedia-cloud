import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadMyTodos, today } from '@/lib/fulfillment/views';
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

  return NextResponse.json({
    buchhaltung,
    weitere,
    schritte,
    ads: ((ads ?? []) as Array<{ agency_id: string }>).map((a) => ({ ...a, agency_name: names.get(a.agency_id) ?? '–' })),
  });
}
