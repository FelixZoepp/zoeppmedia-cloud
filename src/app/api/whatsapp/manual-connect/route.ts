import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { richteNummerEin } from '@/lib/whatsapp/einrichtung';
import { z } from 'zod';

const ManualSchema = z.object({
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  // Nur Platform-Admins
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Nur Platform-Admins können manuell verbinden' }, { status: 403 });
  }

  const agencyId = await getEffectiveAgencyId(user);
  if (!agencyId) {
    return NextResponse.json({ error: 'Keine Agentur — bitte zuerst impersonieren' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }
  const parsed = ManualSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validierungsfehler: wabaId, phoneNumberId und accessToken erforderlich' }, { status: 400 });
  }

  try {
    const r = await richteNummerEin(createAdminClient(), {
      agencyId,
      wabaId: parsed.data.wabaId,
      phoneNumberId: parsed.data.phoneNumberId,
      accessToken: parsed.data.accessToken,
      userId: user.id,
      methode: 'manual',
    });
    if (r.http && r.http >= 400) return NextResponse.json({ error: r.fehler.join(' · ') }, { status: r.http });
    return NextResponse.json({ ok: r.ok, accountId: r.accountId, status: r.status, fehler: r.fehler });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
