import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeStartklar } from '@/lib/startklar/laden';
import { ladeSchalter } from '@/lib/recruiting/kontakt-schalter';

type Ctx = { params: Promise<{ id: string }> };

/** GET – Startklar-Stand + Bewerber-Kontakt eines Kunden (intern; schalten dürfen nur Admins) */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const svc = createAdminClient();
  const [startklar, schalter] = await Promise.all([ladeStartklar(svc, id), ladeSchalter(svc)]);
  return NextResponse.json({
    startklar,
    kontakt: { global: schalter.aktiv, kunde: schalter.kunden.includes(id), darfSchalten: user.role === 'admin' },
  });
}
