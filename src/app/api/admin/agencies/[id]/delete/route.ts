import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Verify agency exists
  const { data: agency } = await admin
    .from('agencies')
    .select('id')
    .eq('id', id)
    .single();

  if (!agency) {
    return NextResponse.json({ error: 'Agentur nicht gefunden' }, { status: 404 });
  }

  // Delete invite_tokens for this agency
  await admin.from('invite_tokens').delete().eq('agency_id', id);

  // Delete users for this agency
  await admin.from('users').delete().eq('agency_id', id);

  // Delete the agency itself
  const { error } = await admin.from('agencies').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
