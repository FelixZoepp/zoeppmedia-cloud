import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { logActivity } from '@/lib/activity/log';
import { legeFunnelLeadAn } from '@/lib/perspective/leads';

/**
 * Perspective-Funnel-Webhook. Pro Kunde wird im Funnel die URL
 * /api/webhooks/perspective?agency=<agency-id> hinterlegt.
 *
 * Perspective sendet: { id, funnelName, meta: {...}, profile: { name: { value, title }, email: {...}, phone: {...}, ... } }
 * Flache Bodies ({ name, email, phone }) werden weiterhin akzeptiert.
 * Alternativ (Altbestand): Zuordnung über funnel_id → perspective_funnels.
 *
 * Shared-Secret-Prüfung, sobald PERSPECTIVE_WEBHOOK_SECRET gesetzt ist
 * (Header x-webhook-secret oder ?secret=).
 */

type ProfileField = { value?: unknown } | string | null | undefined;

function fieldValue(field: ProfileField): string | null {
  if (typeof field === 'string') return field.trim() || null;
  if (field && typeof field === 'object' && 'value' in field) {
    const v = (field as { value?: unknown }).value;
    if (typeof v === 'string') return v.trim() || null;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.PERSPECTIVE_WEBHOOK_SECRET;
  if (webhookSecret) {
    const provided =
      request.headers.get('x-webhook-secret') ||
      request.nextUrl.searchParams.get('secret');
    if (provided !== webhookSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // --- Agentur bestimmen: ?agency=<uuid> (bevorzugt) oder funnel_id-Mapping ---
  const agencyParam = request.nextUrl.searchParams.get('agency');
  let agencyId: string;

  if (agencyParam && isUuid(agencyParam)) {
    const { data: agency } = await supabase
      .from('agencies')
      .select('id')
      .eq('id', agencyParam)
      .maybeSingle();
    if (!agency) {
      return NextResponse.json({ error: 'Agentur nicht gefunden' }, { status: 404 });
    }
    agencyId = agency.id;
  } else {
    const funnelId = typeof body.funnel_id === 'string' ? body.funnel_id : null;
    if (!funnelId) {
      console.log('[perspective-webhook] Keine Agentur-Zuordnung möglich. Payload:', JSON.stringify(body).slice(0, 2000));
      return NextResponse.json(
        { error: 'agency-Query-Parameter oder funnel_id ist erforderlich' },
        { status: 400 }
      );
    }
    const { data: funnel } = await supabase
      .from('perspective_funnels')
      .select('agency_id')
      .eq('perspective_funnel_id', funnelId)
      .maybeSingle();
    if (!funnel) {
      return NextResponse.json(
        { error: `Kein Funnel für perspective_funnel_id "${funnelId}" gefunden` },
        { status: 404 }
      );
    }
    agencyId = funnel.agency_id;
  }

  // --- Kontaktdaten extrahieren: Perspective-Format (profile.*.value) oder flach ---
  const profile = (body.profile ?? {}) as Record<string, ProfileField>;

  const firstName = fieldValue(profile.firstName);
  const lastName = fieldValue(profile.lastName);
  const combinedName = [firstName, lastName].filter(Boolean).join(' ') || null;

  const name =
    fieldValue(profile.name) ||
    combinedName ||
    (typeof body.name === 'string' ? body.name.trim() : null) ||
    null;
  const email =
    fieldValue(profile.email) ||
    (typeof body.email === 'string' ? body.email.trim() : null) ||
    null;
  const phone =
    fieldValue(profile.phone) ||
    (typeof body.phone === 'string' ? body.phone.trim() : null) ||
    null;

  if (!name && !email && !phone) {
    console.log('[perspective-webhook] Keine Kontaktdaten im Payload:', JSON.stringify(body).slice(0, 2000));
    return NextResponse.json(
      { error: 'Mindestens eines der Felder name, email oder phone ist erforderlich' },
      { status: 400 }
    );
  }

  // --- Anlegen (gleiche Logik wie der automatische Perspective-Abgleich) ---
  const ergebnis = await legeFunnelLeadAn(supabase, agencyId, {
    name,
    email,
    phone,
    funnelName: (body.funnelName as string) ?? null,
    externeId: typeof body.id === 'string' && body.id ? `perspective:${body.id}` : null,
    automationen: true,
  });
  if (ergebnis.status === 'fehler') return NextResponse.json({ error: ergebnis.fehler }, { status: 500 });
  if (ergebnis.status === 'doppelt') {
    await logActivity(supabase, {
      agency_id: agencyId,
      candidate_id: ergebnis.candidateId,
      action: `Doppelte Funnel-Bewerbung erkannt: ${name ?? email ?? phone} – nicht erneut angelegt`,
      action_type: 'other',
      metadata: { source: 'perspective', duplicate_of: ergebnis.candidateId, funnel_name: (body.funnelName as string) ?? null },
    });
    return NextResponse.json({ ok: true, duplicate: true, candidate_id: ergebnis.candidateId });
  }
  return NextResponse.json({ ok: true, candidate_id: ergebnis.candidateId });
}
