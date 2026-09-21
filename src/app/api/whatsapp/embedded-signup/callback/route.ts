import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/whatsapp/provider';
import { encryptSecret } from '@/lib/crypto';
import { seedTemplatesForAccount } from '@/lib/whatsapp/template-presets';
import { z } from 'zod';

const CallbackSchema = z.object({
  code: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }
  // Org Admin oder Platform Admin
  if (user.role !== 'agency_owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Nur Org-Admins können WhatsApp verbinden' }, { status: 403 });
  }

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CallbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validierungsfehler' }, { status: 400 });
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json({ error: 'Meta App nicht konfiguriert' }, { status: 500 });
  }

  try {
    const provider = getProvider();

    // 1. Code gegen Token tauschen
    const { accessToken, wabaId, phoneNumberId } = await provider.exchangeCode(
      parsed.data.code, appId, appSecret
    );

    // 2. Verschlüsselt speichern
    const tokenEnc = encryptSecret(accessToken);
    const svc = createAdminClient();

    // Cross-Agency-Schutz: prüfen ob phone_number_id bereits einer anderen Agentur gehört
    const { data: existing } = await svc
      .from('whatsapp_accounts')
      .select('id, agency_id')
      .eq('phone_number_id', phoneNumberId)
      .maybeSingle();
    if (existing && existing.agency_id !== agencyId) {
      return NextResponse.json({ error: 'Diese Telefonnummer ist bereits mit einer anderen Agentur verbunden' }, { status: 409 });
    }

    const { data: waAccount, error: insertErr } = await svc
      .from('whatsapp_accounts')
      .upsert({
        agency_id: agencyId,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        access_token_enc: tokenEnc,
        provider: 'cloud_api',
        status: 'connected',
        connected_at: new Date().toISOString(),
      }, { onConflict: 'phone_number_id' })
      .select('id')
      .single();

    if (insertErr || !waAccount) {
      return NextResponse.json({ error: 'WhatsApp-Konto konnte nicht gespeichert werden' }, { status: 500 });
    }

    // 3. Nummer registrieren
    await provider.registerPhone(phoneNumberId, accessToken).catch(() => {});

    // 4. Webhook abonnieren
    await provider.subscribeWebhook(wabaId, accessToken).catch(() => {});

    // 5. Vorlagen seeden + submitten
    await seedTemplatesForAccount(svc, waAccount.id, agencyId);

    // 6. Audit-Log
    await svc.from('audit_log').insert({
      actor_id: user.id,
      agency_id: agencyId,
      action: 'whatsapp.connected',
      target: waAccount.id,
      data: { waba_id: wabaId, phone_number_id: phoneNumberId, method: 'embedded_signup' },
    });

    return NextResponse.json({ ok: true, accountId: waAccount.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
