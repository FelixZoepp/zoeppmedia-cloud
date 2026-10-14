import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { GESPERRTE_KUNDEN, ladeManatalOrganisationen, ladeZuordnung, manatalAktiv, schlageKundenVor, speichereZuordnung } from '@/lib/manatal/abgleich';

/** GET – Manatal-Organisationen mit Zuordnung zu Kunden (nur Admins) */
export async function GET() {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  if (!manatalAktiv()) return NextResponse.json({ aktiv: false, organisationen: [], kunden: [] });
  const svc = createAdminClient();
  const [orgs, zuordnung, { data: kunden }] = await Promise.all([
    ladeManatalOrganisationen().catch((e: unknown) => (e instanceof Error ? e : new Error(String(e)))),
    ladeZuordnung(svc),
    svc.from('agencies').select('id, name').neq('id', SALES_AGENCY_ID).order('name'),
  ]);
  if (orgs instanceof Error) return NextResponse.json({ aktiv: true, fehler: orgs.message, organisationen: [], kunden: [] });
  const liste = ((kunden ?? []) as Array<{ id: string; name: string }>).filter((k) => !GESPERRTE_KUNDEN.has(k.id));
  return NextResponse.json({
    aktiv: true,
    organisationen: orgs.map((o) => ({ ...o, agencyId: zuordnung[String(o.id)] ?? null, vorschlag: zuordnung[String(o.id)] ? null : schlageKundenVor(o.name, liste) })),
    kunden: liste,
  });
}

/** PUT { orgId, agencyId|null } – Organisation einem Kunden zuordnen oder Zuordnung lösen */
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { orgId?: unknown; agencyId?: unknown };
  const orgId = typeof b.orgId === 'number' || (typeof b.orgId === 'string' && /^\d+$/.test(b.orgId)) ? String(b.orgId) : null;
  if (!orgId) return NextResponse.json({ error: 'orgId fehlt' }, { status: 400 });
  const svc = createAdminClient();
  const agencyId = typeof b.agencyId === 'string' && b.agencyId ? b.agencyId : null;
  if (agencyId) {
    const { data } = await svc.from('agencies').select('id').eq('id', agencyId).maybeSingle();
    if (!data || agencyId === SALES_AGENCY_ID || GESPERRTE_KUNDEN.has(agencyId)) return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
  }
  const zuordnung = await ladeZuordnung(svc);
  if (agencyId) zuordnung[orgId] = agencyId;
  else delete zuordnung[orgId];
  await speichereZuordnung(svc, zuordnung);
  await svc.from('audit_log').insert({ actor_id: user.id, agency_id: agencyId, action: 'manatal.zuordnung', target: orgId, data: { agencyId } });
  return NextResponse.json({ ok: true });
}
