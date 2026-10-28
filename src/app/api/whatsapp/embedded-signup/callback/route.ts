import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/whatsapp/provider';
import { richteNummerEin } from '@/lib/whatsapp/einrichtung';
import { z } from 'zod';

const CallbackSchema = z.object({
  code: z.string().min(1),
  // Von Meta im Embedded Signup gemeldet (Nachricht WA_EMBEDDED_SIGNUP / FINISH)
  waba_id: z.string().min(1).optional(),
  phone_number_id: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  // Kunden-Inhaber oder Admin
  if (user.role !== 'agency_owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Nur Inhaber oder Admins können WhatsApp verbinden' }, { status: 403 });
  }
  const agencyId = await getEffectiveAgencyId(user);
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const parsed = CallbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Validierungsfehler' }, { status: 400 });

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return NextResponse.json({ error: 'Meta App nicht konfiguriert' }, { status: 500 });

  try {
    const { accessToken, wabaId, phoneNumberId } = await getProvider().exchangeCode(parsed.data.code, appId, appSecret, {
      wabaId: parsed.data.waba_id,
      phoneNumberId: parsed.data.phone_number_id,
    });
    if (!wabaId || !phoneNumberId) return NextResponse.json({ error: 'Meta hat keine Nummer übermittelt – bitte erneut verbinden' }, { status: 400 });
    const r = await richteNummerEin(createAdminClient(), { agencyId, wabaId, phoneNumberId, accessToken, userId: user.id, methode: 'embedded_signup' });
    if (r.http && r.http >= 400) return NextResponse.json({ error: r.fehler.join(' · ') }, { status: r.http });
    return NextResponse.json({ ok: r.ok, accountId: r.accountId, status: r.status, fehler: r.fehler });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' }, { status: 500 });
  }
}
