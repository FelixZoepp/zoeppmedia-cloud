import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { sendInviteEmail } from '@/lib/email/resend';
import { logActivity } from '@/lib/activity/log';

export async function GET() {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: agencies } = await admin
    .from('agencies')
    .select('*')
    .order('created_at', { ascending: false });

  // Get candidate counts per agency
  const { data: counts } = await admin
    .from('candidates')
    .select('agency_id');

  const countMap: Record<string, number> = {};
  counts?.forEach((c) => {
    countMap[c.agency_id] = (countMap[c.agency_id] || 0) + 1;
  });

  // Get last login per agency
  const { data: logins } = await admin
    .from('users')
    .select('agency_id, last_login')
    .order('last_login', { ascending: false });

  const loginMap: Record<string, string | null> = {};
  logins?.forEach((u) => {
    if (!loginMap[u.agency_id] && u.last_login) {
      loginMap[u.agency_id] = u.last_login;
    }
  });

  const result = agencies?.map((a) => ({
    ...a,
    candidate_count: countMap[a.id] || 0,
    last_login: loginMap[a.id] || null,
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { name, contact_name, email, phone } = await request.json();

  if (!name || !contact_name || !email) {
    return NextResponse.json({ error: 'Name, Ansprechpartner und E-Mail sind erforderlich.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Create agency
  const { data: agency, error: agencyError } = await admin
    .from('agencies')
    .insert({ name, contact_name, email, phone: phone || null })
    .select()
    .single();

  if (agencyError) {
    return NextResponse.json({ error: 'Agentur konnte nicht erstellt werden.' }, { status: 500 });
  }

  // Create invite token
  const { data: invite } = await admin
    .from('invite_tokens')
    .insert({ agency_id: agency.id, email })
    .select()
    .single();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const invite_url = `${baseUrl}/register/${invite!.token}`;

  try {
    const expiresAt = new Date(Date.now() + 7 * 86400000).toLocaleDateString('de-DE');
    await sendInviteEmail(email, name, invite_url, expiresAt);
    await admin
      .from('invite_tokens')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', invite!.id);
  } catch {
    // Email failed but invite was created — log but don't fail
  }

  const admin2 = createAdminClient();
  await logActivity(admin2, {
    agency_id: agency.id,
    action: `Einladung gesendet an ${email}`,
    action_type: 'invite_sent',
    metadata: { email, agency_name: name },
  });

  return NextResponse.json({ agency, invite_url });
}
