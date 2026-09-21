import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/whatsapp/provider';
import { encryptSecret } from '@/lib/crypto';
import { seedTemplatesForAccount } from '@/lib/whatsapp/template-presets';
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

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: 'Keine Agentur — bitte zuerst impersonieren' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = ManualSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validierungsfehler: wabaId, phoneNumberId und accessToken erforderlich' }, { status: 400 });
  }

  try {
    const svc = createAdminClient();
    const tokenEnc = encryptSecret(parsed.data.accessToken);
    const provider = getProvider();

    const { data: waAccount, error: insertErr } = await svc
      .from('whatsapp_accounts')
      .upsert({
        agency_id: agencyId,
        waba_id: parsed.data.wabaId,
        phone_number_id: parsed.data.phoneNumberId,
        access_token_enc: tokenEnc,
        provider: 'cloud_api',
        status: 'connected',
        connected_at: new Date().toISOString(),
      }, { onConflict: 'phone_number_id' })
      .select('id')
      .single();

    if (insertErr || !waAccount) {
      return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
    }

    // Nummer registrieren + Webhook abonnieren
    await provider.registerPhone(parsed.data.phoneNumberId, parsed.data.accessToken).catch(() => {});
    await provider.subscribeWebhook(parsed.data.wabaId, parsed.data.accessToken).catch(() => {});

    // Vorlagen seeden
    await seedTemplatesForAccount(svc, waAccount.id, agencyId);

    // Audit-Log
    await svc.from('audit_log').insert({
      actor_id: user.id,
      agency_id: agencyId,
      action: 'whatsapp.connected',
      target: waAccount.id,
      data: { waba_id: parsed.data.wabaId, phone_number_id: parsed.data.phoneNumberId, method: 'manual' },
    });

    return NextResponse.json({ ok: true, accountId: waAccount.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
