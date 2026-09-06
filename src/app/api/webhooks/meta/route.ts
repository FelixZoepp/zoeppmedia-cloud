import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { checkBlacklist } from '@/lib/candidates/blacklist-check';
import { logActivity } from '@/lib/activity/log';
import { getStagesForAgency } from '@/lib/pipeline/get-stages';
import { fireEvent } from '@/lib/automations/fire';

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

  // Get first pipeline stage for this agency
  const stages = await getStagesForAgency(supabase, agencyId);
  const firstStage = stages[0];
  if (!firstStage) {
    return NextResponse.json({ error: 'No pipeline stages configured' }, { status: 500 });
  }

  // Process Meta lead entries
  const entries = body?.entry || [];
  for (const entry of entries) {
    const changes = entry?.changes || [];
    for (const change of changes) {
      if (change.field !== 'leadgen') continue;

      const leadData = change.value;
      const name = extractField(leadData, 'full_name') || extractField(leadData, 'first_name') || 'Unbekannt';
      const email = extractField(leadData, 'email');
      const phone = extractField(leadData, 'phone_number');

      const { data: candidate } = await supabase
        .from('candidates')
        .insert({
          agency_id: agencyId,
          name,
          email,
          phone,
          source: 'meta',
          meta_campaign: leadData.campaign_name || null,
          meta_adset: leadData.adset_name || null,
          meta_form: leadData.form_name || null,
          current_stage_id: firstStage.id,
        })
        .select()
        .single();

      if (candidate) {
        await supabase.from('candidate_stages').insert({
          candidate_id: candidate.id,
          stage_id: firstStage.id,
          changed_by: null,
        });

        fireEvent('candidate_created', agencyId, { candidate_id: candidate.id }).catch(() => {});

        // Check blacklist
        const blacklistResult = await checkBlacklist(supabase, agencyId, email, phone);
        if (blacklistResult.is_blacklisted) {
          await logActivity(supabase, {
            agency_id: agencyId,
            candidate_id: candidate.id,
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

function extractField(leadData: Record<string, unknown>, fieldName: string): string | null {
  const fieldData = leadData.field_data as Array<{ name: string; values: string[] }> | undefined;
  if (!fieldData) return null;
  const field = fieldData.find((f) => f.name === fieldName);
  return field?.values?.[0] || null;
}
