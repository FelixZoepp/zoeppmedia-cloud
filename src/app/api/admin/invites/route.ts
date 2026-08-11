import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextResponse } from 'next/server';

// Returns the most recent invite token per agency (for status display)
export async function GET() {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('invite_tokens')
    .select('id, agency_id, token, email_sent_at, redeemed, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Fehler beim Laden der Einladungen.' }, { status: 500 });
  }

  // Return only the most recent invite per agency
  const seen = new Set<string>();
  const latest = (data ?? []).filter((inv) => {
    if (seen.has(inv.agency_id)) return false;
    seen.add(inv.agency_id);
    return true;
  });

  return NextResponse.json(latest);
}
