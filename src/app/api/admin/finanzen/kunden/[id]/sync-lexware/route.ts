import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';
import { syncLexwareContact, findLexwareContact } from '@/lib/billing/lexware-sync';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Get agency
  const { data: agency } = await admin
    .from('agencies')
    .select('name')
    .eq('id', id)
    .single();

  if (!agency) {
    return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
  }

  // Check if lexware_contact_id is provided in body or find by name
  const body = await request.json().catch(() => ({}));
  let lexContactId = body.lexware_contact_id as string | undefined;

  if (!lexContactId) {
    const found = await findLexwareContact(agency.name);
    if (!found) {
      return NextResponse.json({ error: `Kein Lexware-Kontakt für "${agency.name}" gefunden` }, { status: 404 });
    }
    lexContactId = found.id;
  }

  const result = await syncLexwareContact(admin, id, lexContactId);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, lexware_contact_id: lexContactId });
}
