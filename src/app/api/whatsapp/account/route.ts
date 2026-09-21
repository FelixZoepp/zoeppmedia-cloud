import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json(null);

  const svc = createAdminClient();
  const { data } = await svc
    .from('whatsapp_accounts')
    .select('id, waba_id, phone_number_id, display_number, status, quality_rating, messaging_limit, connected_at')
    .eq('agency_id', agencyId)
    .eq('status', 'connected')
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json(data);
}
