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

  return NextResponse.json({
    buchhaltung,
    schritte,
    ads: ((ads ?? []) as Array<{ agency_id: string }>).map((a) => ({ ...a, agency_name: names.get(a.agency_id) ?? '–' })),
  });
}
