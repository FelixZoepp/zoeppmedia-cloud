import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';
import { sendInviteEmail } from '@/lib/email/resend';

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { name, email, position } = await request.json();

  if (!name || !email) {
    return NextResponse.json({ error: 'Name und E-Mail sind erforderlich.' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invite, error } = await admin
    .from('employee_invites')
    .insert({ name, email, position: position || null })
    .select()
    .single();

  if (error || !invite) {
    return NextResponse.json({ error: 'Einladung konnte nicht erstellt werden.' }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const registerUrl = `${baseUrl}/register-employee/${invite.token}`;
  const expiresAt = new Date(Date.now() + 7 * 86400000).toLocaleDateString('de-DE');

  try {
    await sendInviteEmail(email, 'Zoepp Media Team', registerUrl, expiresAt);
  } catch {
    // Email failed but invite was created — don't fail the request
  }

  return NextResponse.json({ invite_url: registerUrl });
}

export async function GET() {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('employee_invites')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
