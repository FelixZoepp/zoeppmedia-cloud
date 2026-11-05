import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin, isInternalUser } from '@/lib/admin';
import { isUuid } from '@/lib/supabase/filters';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { basisUrl, fehltZumAktivieren, ladeLisaVerbindung, type LisaStatus } from '@/lib/lisa/verbindung';

async function pruefen(agencyId: string, nurAdmin = false) {
  const supabase = await createServerClient();
  if (!(await (nurAdmin ? isAdmin(supabase) : isInternalUser(supabase)))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  if (!isUuid(agencyId)) return NextResponse.json({ error: 'Ungültige Agentur-ID' }, { status: 400 });
  return null;
}

function stand(row: Awaited<ReturnType<typeof ladeLisaVerbindung>>) {
  return {
    status: row?.status ?? null,
    basis_url: row?.basis_url ?? null,
    hatSchluessel: !!row?.api_key_enc,
    hatWebhookSecret: !!row?.webhook_secret_enc,
    einwilligung_text: row?.einwilligung_text ?? null,
    einwilligung_version: row?.einwilligung_version ?? null,
    angefragt_am: row?.angefragt_am ?? null,
    anfrage_notiz: row?.anfrage_notiz ?? null,
    aktiviert_am: row?.aktiviert_am ?? null,
    letzter_versand_am: row?.letzter_versand_am ?? null,
    letztes_ereignis_am: row?.letztes_ereignis_am ?? null,
    letzter_fehler: row?.letzter_fehler ?? null,
    fehlt: row ? fehltZumAktivieren(row) : fehltZumAktivieren({ api_key_enc: null, webhook_secret_enc: null, einwilligung_text: null }),
  };
}

/** GET: Stand (ohne Geheimnisse) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ agencyId: string }> }) {
  const { agencyId } = await params;
  const f = await pruefen(agencyId);
  if (f) return f;
  return NextResponse.json(stand(await ladeLisaVerbindung(createAdminClient(), agencyId)));
}

/**
 * PATCH { api_key?, webhook_secret?, basis_url?, einwilligung_text?, einwilligung_version?, status? }
 * Schlüssel und Secret kommen aus Lisa (Einstellungen → Integrationen) und werden nur verschlüsselt gespeichert.
 * 'aktiv' geht nur, wenn Schlüssel, Secret und Einwilligungstext da sind.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ agencyId: string }> }) {
  const { agencyId } = await params;
  const f = await pruefen(agencyId, true);
  if (f) return f;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const svc = createAdminClient();
  const vorher = await ladeLisaVerbindung(svc, agencyId);
  const jetzt = new Date().toISOString();
  const upd: Record<string, unknown> = { agency_id: agencyId, updated_at: jetzt };

  if (typeof body.api_key === 'string' && body.api_key.trim()) {
    const k = body.api_key.trim();
    if (!/^lisa_in_\S{8,}$/.test(k)) return NextResponse.json({ error: 'Der Schlüssel beginnt mit lisa_in_ …' }, { status: 400 });
    upd.api_key_enc = encryptSecret(k);
  }
  if (typeof body.webhook_secret === 'string' && body.webhook_secret.trim()) {
    const s = body.webhook_secret.trim();
    if (s.length < 16 || s.length > 300) return NextResponse.json({ error: 'Das Webhook-Secret sieht ungültig aus (lisa_whsec_…)' }, { status: 400 });
    upd.webhook_secret_enc = encryptSecret(s);
  }
  if (typeof body.basis_url === 'string') {
    const u = body.basis_url.trim();
    if (u && !/^https:\/\/[^\s/]+/.test(u)) return NextResponse.json({ error: 'Lisa-Adresse muss mit https:// beginnen' }, { status: 400 });
    upd.basis_url = u || null;
  }
  if (typeof body.einwilligung_text === 'string') upd.einwilligung_text = body.einwilligung_text.trim().slice(0, 1000) || null;
  if (typeof body.einwilligung_version === 'string') upd.einwilligung_version = body.einwilligung_version.trim().slice(0, 40) || null;

  const neuerStatus = body.status as LisaStatus | undefined;
  if (neuerStatus !== undefined) {
    if (!['eingerichtet', 'aktiv', 'pausiert'].includes(neuerStatus)) return NextResponse.json({ error: 'Ungültiger Status' }, { status: 400 });
    if (neuerStatus === 'aktiv') {
      const fehlt = fehltZumAktivieren({
        api_key_enc: (upd.api_key_enc as string | undefined) ?? vorher?.api_key_enc ?? null,
        webhook_secret_enc: (upd.webhook_secret_enc as string | undefined) ?? vorher?.webhook_secret_enc ?? null,
        einwilligung_text: (upd.einwilligung_text as string | null | undefined) !== undefined ? (upd.einwilligung_text as string | null) : vorher?.einwilligung_text ?? null,
      });
      if (fehlt.length) return NextResponse.json({ error: `Zum Freischalten fehlt: ${fehlt.join(', ')}` }, { status: 400 });
      if (!vorher?.aktiviert_am) upd.aktiviert_am = jetzt;
    }
    upd.status = neuerStatus;
  } else if (!vorher || vorher.status === 'angefragt') {
    // Erste Schlüssel eingetragen → eingerichtet (noch nicht aktiv)
    if (upd.api_key_enc || upd.webhook_secret_enc) upd.status = 'eingerichtet';
  }

  const { error } = await svc.from('lisa_verbindungen').upsert(upd, { onConflict: 'agency_id' });
  if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
  return NextResponse.json({ ok: true, ...stand(await ladeLisaVerbindung(svc, agencyId)) });
}

/** POST: Verbindung testen – fragt einen nicht vorhandenen Bewerber ab (404 = Schlüssel gültig, 401 = falsch) */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ agencyId: string }> }) {
  const { agencyId } = await params;
  const f = await pruefen(agencyId);
  if (f) return f;
  const row = await ladeLisaVerbindung(createAdminClient(), agencyId);
  if (!row?.api_key_enc) return NextResponse.json({ ok: false, fehler: 'Noch kein API-Schlüssel hinterlegt' });
  try {
    const res = await fetch(`${basisUrl(row)}/api/v1/applicants/${randomUUID()}`, {
      headers: { Authorization: `Bearer ${decryptSecret(row.api_key_enc)}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404 || res.ok) return NextResponse.json({ ok: true });
    if (res.status === 401) return NextResponse.json({ ok: false, fehler: 'Lisa kennt diesen Schlüssel nicht (401)' });
    if (res.status === 403) return NextResponse.json({ ok: false, fehler: 'Integration ist in Lisa deaktiviert (403)' });
    return NextResponse.json({ ok: false, fehler: `Lisa antwortet mit ${res.status}` });
  } catch {
    return NextResponse.json({ ok: false, fehler: 'Lisa nicht erreichbar' });
  }
}
