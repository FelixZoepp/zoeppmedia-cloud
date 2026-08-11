import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@/lib/email/resend';

export async function POST(request: NextRequest) {
  const { token, name, email, password } = await request.json();

  if (!token || !name || !email || !password) {
    return NextResponse.json({ error: 'Alle Felder sind erforderlich.' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Passwort muss mindestens 8 Zeichen haben.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Validate invite token
  const { data: invite, error: inviteError } = await supabase
    .from('invite_tokens')
    .select('*')
    .eq('token', token)
    .single();

  if (inviteError || !invite) {
    return NextResponse.json({ error: 'Ungültiger Einladungslink.' }, { status: 400 });
  }

  if (invite.redeemed) {
    return NextResponse.json({ error: 'Dieser Einladungslink wurde bereits verwendet.' }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Dieser Einladungslink ist abgelaufen.' }, { status: 400 });
  }

  // Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    return NextResponse.json({ error: 'Registrierung fehlgeschlagen: ' + authError.message }, { status: 400 });
  }

  // Create users row
  const { error: userError } = await supabase.from('users').insert({
    id: authData.user.id,
    agency_id: invite.agency_id,
    email,
    name,
    role: 'owner',
  });

  if (userError) {
    // Rollback: delete auth user
    await supabase.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: 'Benutzer konnte nicht erstellt werden.' }, { status: 500 });
  }

  // Mark token as redeemed
  await supabase
    .from('invite_tokens')
    .update({ redeemed: true })
    .eq('id', invite.id);

  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login`;
  try {
    await sendWelcomeEmail(email, name, loginUrl);
  } catch {
    // Email failed but registration succeeded
  }

  return NextResponse.json({ success: true });
}
