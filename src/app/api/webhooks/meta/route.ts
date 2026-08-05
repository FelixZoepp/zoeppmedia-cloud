import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

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

  // Get "Eingang" stage
  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('sort_order', 1)
    .single();

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
          current_stage_id: stage!.id,
        })
        .select()
        .single();

      if (candidate) {
        await supabase.from('candidate_stages').insert({
          candidate_id: candidate.id,
          stage_id: stage!.id,
          changed_by: null,
        });
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
