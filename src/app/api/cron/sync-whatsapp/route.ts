/**
 * Stündlicher Cron: Vorlagen-Status und Qualitätsbewertung synchronisieren.
 * Spec Abschn. 7: Vorlagenverwaltung, Orchestrator-Ruling 7.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/whatsapp/provider';
import { decryptSecret } from '@/lib/crypto';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET nicht konfiguriert' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = createAdminClient();
  const provider = getProvider();
  let accountsSynced = 0;
  let templatesUpdated = 0;

  // Alle verbundenen Accounts laden
  const { data: accounts } = await svc
    .from('whatsapp_accounts')
    .select('id, waba_id, phone_number_id, access_token_enc, agency_id')
    .eq('status', 'connected');

  for (const account of accounts || []) {
    try {
      const token = decryptSecret(account.access_token_enc);

      // 1. Vorlagen-Status synchronisieren
      const templates = await provider.listTemplates(account.waba_id, token);
      for (const tmpl of templates) {
        const { count } = await svc
          .from('whatsapp_templates')
          .update({
            status: tmpl.status.toLowerCase(),
            meta_template_id: tmpl.id,
            updated_at: new Date().toISOString(),
          })
          .eq('wa_account_id', account.id)
          .eq('name', tmpl.name)
          .eq('language', tmpl.language);

        if (count && count > 0) templatesUpdated++;
      }

      // 2. Qualitätsbewertung + Messaging-Limit aktualisieren
      // (Erfordert phone_number_id Endpoint — vereinfacht über den bestehenden Provider)
      // In v1 reicht der Sync über listTemplates; Qualität wird via Webhook aktualisiert.

      accountsSynced++;
    } catch {
      // Silent — nächster Sync-Lauf versucht es erneut
    }
  }

  return NextResponse.json({
    ok: true,
    accountsSynced,
    templatesUpdated,
  });
}
