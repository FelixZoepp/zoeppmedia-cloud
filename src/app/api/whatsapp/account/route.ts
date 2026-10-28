import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

async function kontext() {
  const user = await getCurrentUser();
  if (!user) return { fehler: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) };
  const agencyId = await getEffectiveAgencyId(user);
  if (!agencyId) return { fehler: NextResponse.json({ error: 'Keine Agentur' }, { status: 403 }) };
  return { user, agencyId };
}

async function aktuellesKonto(agencyId: string) {
  const { data } = await createAdminClient()
    .from('whatsapp_accounts')
    .select('id, waba_id, phone_number_id, display_number, verified_name, status, quality_rating, messaging_limit, connected_at, fehler, geprueft_am')
    .eq('agency_id', agencyId)
    .in('status', ['connected', 'einrichtung'])
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string } | null;
}

export async function GET() {
  const k = await kontext();
  if ('fehler' in k) return k.fehler;
  return NextResponse.json(await aktuellesKonto(k.agencyId));
}

/** POST { aktion: 'pruefen' } – Registrierung/Webhook/Infos erneut prüfen */
export async function POST(req: NextRequest) {
  const k = await kontext();
  if ('fehler' in k) return k.fehler;
  if (k.user.role !== 'agency_owner' && k.user.role !== 'admin') return NextResponse.json({ error: 'Nur Inhaber oder Admins' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { aktion?: string };
  if (b.aktion !== 'pruefen') return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
  const konto = await aktuellesKonto(k.agencyId);
  if (!konto) return NextResponse.json({ error: 'Keine Nummer verbunden' }, { status: 404 });
  const { pruefeUndAktiviere } = await import('@/lib/whatsapp/einrichtung');
  const r = await pruefeUndAktiviere(createAdminClient(), konto.id, { userId: k.user.id, methode: 'pruefen' });
  return NextResponse.json({ ...r, konto: await aktuellesKonto(k.agencyId) });
}

/** DELETE – Nummer trennen (der Bot schreibt danach niemanden mehr über diese Nummer an) */
export async function DELETE() {
  const k = await kontext();
  if ('fehler' in k) return k.fehler;
  if (k.user.role !== 'agency_owner' && k.user.role !== 'admin') return NextResponse.json({ error: 'Nur Inhaber oder Admins' }, { status: 403 });
  const konto = await aktuellesKonto(k.agencyId);
  if (!konto) return NextResponse.json({ ok: true });
  const svc = createAdminClient();
  const { error } = await svc.from('whatsapp_accounts').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('id', konto.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await svc.from('audit_log').insert({ actor_id: k.user.id, agency_id: k.agencyId, action: 'whatsapp.disconnected', target: konto.id, data: {} });
  return NextResponse.json({ ok: true });
}
