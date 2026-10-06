import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isInternalUser } from '@/lib/admin';
import { isUuid } from '@/lib/supabase/filters';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { ladePersonaSettings } from '@/lib/persona/konfig';
import { testeVerbindung } from '@/lib/persona/client';

async function pruefen(agencyId: string) {
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  if (!isUuid(agencyId)) return NextResponse.json({ error: 'Ungültige Agentur-ID' }, { status: 400 });
  return null;
}

/** GET: Stand (ohne Geheimnisse) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ agencyId: string }> }) {
  const { agencyId } = await params;
  const f = await pruefen(agencyId);
  if (f) return f;
  const { persona } = await ladePersonaSettings(createAdminClient(), agencyId);
  return NextResponse.json({
    aktiv: !!persona.aktiv,
    freigeschaltet_am: persona.freigeschaltet_am ?? null,
    hatSchluessel: !!persona.api_key_enc,
    hatWebhookSecret: !!persona.webhook_secret_enc,
  });
}

/**
 * PATCH { aktiv?, api_key?, neues_secret? }
 * Das Webhook-Secret wird beim ersten Speichern erzeugt (oder auf Wunsch neu) und NUR in dieser Antwort einmal angezeigt.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ agencyId: string }> }) {
  const { agencyId } = await params;
  const f = await pruefen(agencyId);
  if (f) return f;
  const body = (await req.json().catch(() => ({}))) as { aktiv?: boolean; api_key?: string; neues_secret?: boolean };
  const svc = createAdminClient();
  const { settings, persona } = await ladePersonaSettings(svc, agencyId);
  const neu = { ...persona };

  if (typeof body.aktiv === 'boolean') {
    neu.aktiv = body.aktiv;
    if (body.aktiv && !persona.freigeschaltet_am) neu.freigeschaltet_am = new Date().toISOString();
  }
  if (typeof body.api_key === 'string' && body.api_key.trim()) {
    const key = body.api_key.trim();
    if (key.length < 10 || key.length > 300) return NextResponse.json({ error: 'Der API-Schlüssel sieht ungültig aus' }, { status: 400 });
    neu.api_key_enc = encryptSecret(key);
  }
  let secretKlartext: string | null = null;
  if (!persona.webhook_secret_enc || body.neues_secret) {
    secretKlartext = randomBytes(24).toString('hex');
    neu.webhook_secret_enc = encryptSecret(secretKlartext);
  }

  const { error } = await svc.from('agencies').update({ settings: { ...settings, persona: neu } }).eq('id', agencyId);
  if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
  return NextResponse.json({
    ok: true,
    aktiv: !!neu.aktiv,
    hatSchluessel: !!neu.api_key_enc,
    // nur jetzt einmal sichtbar – zum Eintragen im 12personatypen-Dashboard
    webhookSecret: secretKlartext,
  });
}

/** POST: Verbindung testen */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ agencyId: string }> }) {
  const { agencyId } = await params;
  const f = await pruefen(agencyId);
  if (f) return f;
  const { persona } = await ladePersonaSettings(createAdminClient(), agencyId);
  if (!persona.api_key_enc) return NextResponse.json({ ok: false, fehler: 'Noch kein API-Schlüssel hinterlegt' });
  try {
    await testeVerbindung(decryptSecret(persona.api_key_enc));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, fehler: err instanceof Error ? err.message : 'Verbindung fehlgeschlagen' });
  }
}
