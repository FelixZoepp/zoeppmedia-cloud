import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { providerBereit } from '@/lib/kalender/kunden-kalender';
import { auditEreignis } from '@/lib/audit/log';

async function kontext() {
  const user = await getCurrentUser();
  if (!user) return null;
  const agencyId = await getEffectiveAgencyId(user);
  return agencyId ? { user, agencyId } : null;
}

export async function GET() {
  const k = await kontext();
  if (!k) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { data } = await createAdminClient().from('kalender_verbindungen').select('provider, konto_email, fehler, created_at').eq('agency_id', k.agencyId).eq('aktiv', true).maybeSingle();
  return NextResponse.json({ verbindung: data ?? null, google: providerBereit('google'), microsoft: providerBereit('microsoft'), apple: providerBereit('apple'), darfVerbinden: ['agency_owner', 'admin', 'employee'].includes(k.user.role) });
}

/** DELETE – Kalender trennen */
export async function DELETE() {
  const k = await kontext();
  if (!k) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  if (!['agency_owner', 'admin'].includes(k.user.role)) return NextResponse.json({ error: 'Nur Inhaber oder Admins' }, { status: 403 });
  const svc = createAdminClient();
  const { error } = await svc.from('kalender_verbindungen').update({ aktiv: false, updated_at: new Date().toISOString() }).eq('agency_id', k.agencyId).eq('aktiv', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditEreignis({ userId: k.user.id, agencyId: k.agencyId, entityType: 'agency', action: 'update', ereignis: 'kalender.getrennt', ziel: k.agencyId });
  return NextResponse.json({ ok: true });
}
