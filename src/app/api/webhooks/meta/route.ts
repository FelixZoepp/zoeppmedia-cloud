import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { checkBlacklist } from '@/lib/candidates/blacklist-check';
import { logActivity } from '@/lib/activity/log';
import { getStagesForAgency } from '@/lib/pipeline/get-stages';

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'zoepp-media-cloud';

// Meta webhook verification
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// Receive lead data
export async function POST(request: NextRequest) {
  const agencyId = request.nextUrl.searchParams.get('agency');

  if (!agencyId) {
    return NextResponse.json({ error: 'agency parameter required' }, { status: 400 });
  }

  const body = await request.json();
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
