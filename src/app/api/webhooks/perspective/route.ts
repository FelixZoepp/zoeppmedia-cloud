import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { getStagesForAgency } from '@/lib/pipeline/get-stages';
import { findDuplicateCandidate } from '@/lib/candidates/find-duplicate';
import { checkBlacklist } from '@/lib/candidates/blacklist-check';
import { logActivity } from '@/lib/activity/log';
import { fireEvent } from '@/lib/automations/fire';

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

  // --- Duplikatcheck: Bewerber nicht doppelt anlegen ---
  const duplicate = await findDuplicateCandidate(supabase, agencyId, email, phone);
  if (duplicate) {
    await logActivity(supabase, {
      agency_id: agencyId,
      candidate_id: duplicate.id,
      action: `Doppelte Funnel-Bewerbung erkannt: ${name ?? email ?? phone} entspricht bestehendem Bewerber ${duplicate.name} — nicht erneut angelegt`,
      action_type: 'other',
      metadata: { source: 'perspective', duplicate_of: duplicate.id, funnel_name: (body.funnelName as string) ?? null },
    });
    return NextResponse.json({ ok: true, duplicate: true, candidate_id: duplicate.id });
  }

  // --- Erste Pipeline-Stufe der Agentur (Custom-Stages vor globalen) ---
  const stages = await getStagesForAgency(supabase, agencyId);
  const firstStage = stages[0];
  if (!firstStage) {
    return NextResponse.json(
      { error: 'Keine Pipeline-Stufen konfiguriert' },
      { status: 500 }
    );
  }

  const { data: candidate, error: insertError } = await supabase
    .from('candidates')
    .insert({
      agency_id: agencyId,
      name: name || 'Unbekannt',
      email,
      phone,
      source: 'meta', // Perspective leads arrive via Meta ad funnels
      meta_form: (body.funnelName as string) ?? null,
      current_stage_id: firstStage.id,
    })
    .select()
    .single();

  if (insertError || !candidate) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Bewerber konnte nicht erstellt werden' },
      { status: 500 }
    );
  }

  await supabase.from('candidate_stages').insert({
    candidate_id: candidate.id,
    stage_id: firstStage.id,
    changed_by: null,
  });

  fireEvent('candidate_created', agencyId, { candidate_id: candidate.id }).catch(() => {});

  // Blacklist-Check (nur Warnung, kein Block)
  const blacklistResult = await checkBlacklist(supabase, agencyId, email, phone);
  if (blacklistResult.is_blacklisted) {
    await logActivity(supabase, {
      agency_id: agencyId,
      candidate_id: candidate.id,
      action: `Blacklist-Warnung (Funnel): Bewerber ${candidate.name} stimmt mit gesperrtem Bewerber ${blacklistResult.matching_candidate?.name} überein`,
      action_type: 'other',
      metadata: { source: 'perspective', blacklist_match: blacklistResult.matching_candidate },
    });
  }

  return NextResponse.json({ ok: true, candidate_id: candidate.id });
}
