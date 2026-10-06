import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { logActivity } from '@/lib/activity/log';
import { createNotificationForAgency } from '@/lib/notifications/create';
import { mappeWebhook, pruefeSignatur } from '@/lib/persona/mapping';
import { personaWebhookSecret } from '@/lib/persona/konfig';

/**
 * 12 Persona-Typen → Cloud: Test abgeschlossen.
 * URL je Kunde: /api/webhooks/persona?agency=<id> (im 12personatypen-Dashboard hinterlegt).
 * Signatur: X-SalesDNA-Signature = sha256=HMAC(Roh-Body, Webhook-Secret der Agentur).
 */
export async function POST(request: NextRequest) {
  const agencyId = request.nextUrl.searchParams.get('agency');
  if (!agencyId || !isUuid(agencyId)) return NextResponse.json({ error: 'agency fehlt' }, { status: 400 });

  const rawBody = await request.text();
  const svc = createAdminClient();
  const secret = await personaWebhookSecret(svc, agencyId);
  if (!secret || !pruefeSignatur(rawBody, request.headers.get('x-salesdna-signature'), secret)) {
    return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 });
  }

  const { event, externeId, personaId, email, ergebnis } = mappeWebhook(payload);
  const art = event ?? request.headers.get('x-salesdna-event');
  if (art !== 'candidate.completed') return NextResponse.json({ ok: true, ignoriert: art });

  // Zuordnung nur innerhalb dieser Agentur: 1. unsere Bewerber-ID (Test aus der Cloud verschickt),
  // 2. Persona-Kandidaten-ID, 3. E-Mail-Adresse (Test direkt bei 12personatypen verschickt)
  const finde = async (feld: 'id' | 'persona_extern_id' | 'email', wert: string) => {
    let q = svc.from('candidates').select('id').eq('agency_id', agencyId).is('deleted_at', null);
    q = feld === 'email' ? q.ilike('email', wert) : q.eq(feld, wert);
    const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  };
  const kandidatId =
    (externeId && isUuid(externeId) ? await finde('id', externeId) : null) ??
    (personaId ? await finde('persona_extern_id', personaId) : null) ??
    (email ? await finde('email', email) : null);
  if (!kandidatId) return NextResponse.json({ ok: true, ignoriert: 'Bewerber nicht gefunden' });

  const { data: kand, error } = await svc
    .from('candidates')
    .update({ ...ergebnis, ...(personaId ? { persona_extern_id: personaId } : {}) })
    .eq('id', kandidatId)
    .eq('agency_id', agencyId)
    .select('id, name')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
  if (!kand) return NextResponse.json({ ok: true, ignoriert: 'Bewerber nicht gefunden' });

  const k = kand as { id: string; name: string };
  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: k.id,
    action: `Persona-Test abgeschlossen: ${ergebnis.persona_typ ?? 'Ergebnis liegt vor'}${ergebnis.persona_fit ? ` (${ergebnis.persona_fit})` : ''}`,
    action_type: 'other',
    metadata: { kind: 'persona_test', score: ergebnis.persona_score, warnungen: ergebnis.persona_warnungen.length },
  });
  await createNotificationForAgency(svc, agencyId, {
    title: `Persona-Test abgeschlossen: ${k.name}${ergebnis.persona_typ ? ` – ${ergebnis.persona_typ}` : ''}`,
    body: ergebnis.persona_fit ?? undefined,
    type: 'new_candidate',
    entity_type: 'candidate',
    entity_id: k.id,
    push_url: `/candidates/${k.id}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
