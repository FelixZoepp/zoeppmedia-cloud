import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadMyTodos } from '@/lib/fulfillment/views';

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

  return NextResponse.json({
    schritte,
    ads: ((ads ?? []) as Array<{ agency_id: string }>).map((a) => ({ ...a, agency_name: names.get(a.agency_id) ?? '–' })),
  });
}
