import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { sendInviteEmail } from '@/lib/email/resend';

export async function POST(request: Request) {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { agency_id, agency_name, email } = await request.json();

  if (!agency_id || !email) {
    return NextResponse.json({ error: 'Agency ID und E-Mail erforderlich.' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from('invite_tokens')
    .insert({ agency_id, email })
    .select()
    .single();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const invite_url = `${baseUrl}/register/${invite!.token}`;

  try {
    const expiresAt = new Date(Date.now() + 7 * 86400000).toLocaleDateString('de-DE');
    await sendInviteEmail(email, agency_name || email, invite_url, expiresAt);
    await admin
      .from('invite_tokens')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', invite!.id);
  } catch {
    // Email failed but invite was created — don't fail the request
  }

  return NextResponse.json({ invite_url });
}
