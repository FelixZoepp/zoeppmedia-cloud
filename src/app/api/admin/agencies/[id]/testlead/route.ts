import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { spieleTestleadDurch } from '@/lib/fulfillment/testlead';

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** GET – Handynummer des Testers vorbelegen */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  await params;
  const { data } = await createAdminClient().from('users').select('phone').eq('id', user.id).maybeSingle();
  return NextResponse.json({ phone: (data as { phone: string | null } | null)?.phone ?? null });
}

/** POST { phone? } – Test-Lead durch Webhook → Cloud → WhatsApp schicken, Schritt bei Erfolg abhaken */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  const phone = body.phone?.replace(/[^\d+]/g, '') || null;
  if (phone && phone.length < 8) return NextResponse.json({ error: 'Bitte eine gültige Handynummer angeben' }, { status: 400 });

  const ergebnis = await spieleTestleadDurch(createAdminClient(), id, {
    origin: req.nextUrl.origin,
    tester: { name: user.name ?? 'Team', phone },
    userId: user.id,
  });
  return NextResponse.json(ergebnis);
}
