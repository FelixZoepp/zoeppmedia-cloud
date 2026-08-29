import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAgency } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAgency(user.role) || !user.agency_id) {
    return NextResponse.json({ error: 'Nur fuer Agenturen' }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: agency, error } = await supabase
    .from('agencies')
    .select('status, garantie_start, garantie_ende')
    .eq('id', user.agency_id)
    .single();

  if (error || !agency) {
    return NextResponse.json({ error: 'Agentur nicht gefunden' }, { status: 404 });
  }

  return NextResponse.json(agency);
}
