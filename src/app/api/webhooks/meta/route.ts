import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { checkBlacklist } from '@/lib/candidates/blacklist-check';
import { logActivity } from '@/lib/activity/log';
import { ingestApplication } from '@/lib/recruiting/ingest';
import { createNotificationForAgency } from '@/lib/notifications/create';
import { resolveMetaJob, fetchLeadFromGraph, MetaSource } from '@/lib/meta/lead-mapping';

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

// Verifies Meta's X-Hub-Signature-256 header (HMAC-SHA256 over raw body with App Secret)
function verifyMetaSignature(rawBody: string, sigHeader: string | null, appSecret: string): boolean {
  if (!sigHeader || !sigHeader.startsWith('sha256=')) return false;
  const received = sigHeader.slice('sha256='.length);
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const receivedBuf = Buffer.from(received);
  const expectedBuf = Buffer.from(expected);
  return receivedBuf.length === expectedBuf.length && timingSafeEqual(receivedBuf, expectedBuf);
}

// Meta webhook verification
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// Receive lead data
export async function POST(request: NextRequest) {
  const agencyId = request.nextUrl.searchParams.get('agency');

  if (!agencyId || !isUuid(agencyId)) {
    return NextResponse.json({ error: 'agency parameter required' }, { status: 400 });
  }

  const rawBody = await request.text();

  // Signaturprüfung: Meta signiert jeden Webhook mit dem App Secret (fail-closed)
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: 'Webhook nicht konfiguriert' }, { status: 500 });
  }
  if (!verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const supabase = createAdminClient();

  // Verify agency exists
  const { data: agency } = await supabase
    .from('agencies')
    .select('id')
    .eq('id', agencyId)
    .single();

  if (!agency) {
    return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
  }

  // lead_sources einmalig pro Request laden (N+1-Vermeidung)
  const { data: sources } = await supabase
    .from('lead_sources')
    .select('config')
    .eq('agency_id', agencyId)
    .eq('kind', 'meta')
    .eq('active', true);

  // Process Meta lead entries
  const entries = body?.entry || [];
  for (const entry of entries) {
    const changes = entry?.changes || [];
    for (const change of changes) {
      if (change.field !== 'leadgen') continue;

      const leadData = change.value;
      const leadgenId = (leadData.leadgen_id as string | undefined) || null;
      const formId = (leadData.form_id as string | undefined) || null;

      // Formular→Job-Mapping über lead_sources (Phase 5 Task 6)
      const { jobId: mappedJobId, pageToken } = resolveMetaJob(
        (sources ?? []) as MetaSource[],
        formId
      );

      // Graph-API-Abruf: wenn pageToken vorhanden und leadgenId bekannt, Live-Felder holen
      let fieldData = leadData.field_data as Array<{ name: string; values: string[] }> | undefined;
      if (pageToken && leadgenId) {
        const graphFields = await fetchLeadFromGraph(leadgenId, pageToken);
        if (graphFields) {
          fieldData = graphFields;
        }
      }

      // Felder aus fieldData (Graph oder Payload) extrahieren
      const name = extractFieldFromData(fieldData, 'full_name') || extractFieldFromData(fieldData, 'first_name') || 'Unbekannt';
      const email = extractFieldFromData(fieldData, 'email');
      const phone = extractFieldFromData(fieldData, 'phone_number');

      const nameParts = name.split(' ');
      const firstName = nameParts[0] || 'Unbekannt';
      const lastName = nameParts.slice(1).join(' ') || null;

      // Job-Wahl: Mapping-Ergebnis → Default-Job der Agentur (letzter Fallback)
      let resolvedJobId: string | null = mappedJobId;
      if (!resolvedJobId) {
        const { data: markedDefault } = await supabase
          .from('jobs')
          .select('id')
          .eq('agency_id', agencyId)
          .eq('is_default', true)
          .limit(1)
          .maybeSingle();
        resolvedJobId = markedDefault?.id ?? null;
      }
      if (!resolvedJobId) {
        // Fallback: erster aktiver Job
        const { data: anyJob } = await supabase
          .from('jobs')
          .select('id')
          .eq('agency_id', agencyId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        if (!anyJob) continue; // Kein Job vorhanden
        resolvedJobId = anyJob.id;
      }

      if (!resolvedJobId) continue; // TS-Narrowing: nach beiden Fallbacks gesichert

      const result = await ingestApplication(supabase, {
        agencyId,
        jobId: resolvedJobId,
        firstName,
        lastName,
        phone,
        email,
        source: 'meta',
        sourceRef: leadgenId,
        campaign: {
          campaign_name: leadData.campaign_name || null,
          adset_name: leadData.adset_name || null,
          form_name: leadData.form_name || null,
        },
      });

      // Bestehende Notification + Blacklist beibehalten
      if (result.candidateCreated) {
        await createNotificationForAgency(supabase, agencyId, {
          title: 'Neuer Bewerber: ' + name,
          body: phone ? `Jetzt anrufen: ${phone}` : 'Jetzt kontaktieren',
          type: 'new_candidate',
          entity_type: 'candidate',
          entity_id: result.candidateId,
          push_url: `/candidates/${result.candidateId}`,
        }).catch(() => {});

        const blacklistResult = await checkBlacklist(supabase, agencyId, email, phone);
        if (blacklistResult.is_blacklisted) {
          await logActivity(supabase, {
            agency_id: agencyId,
            candidate_id: result.candidateId,
            action: `Blacklist-Warnung (Meta): Bewerber ${name} stimmt mit gesperrtem Bewerber ${blacklistResult.matching_candidate?.name} überein`,
            action_type: 'other',
            metadata: { source: 'meta', blacklist_match: blacklistResult.matching_candidate },
          });
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}

function extractFieldFromData(
  fieldData: Array<{ name: string; values: string[] }> | undefined,
  fieldName: string
): string | null {
  if (!fieldData) return null;
  const field = fieldData.find((f) => f.name === fieldName);
  return field?.values?.[0] || null;
}
