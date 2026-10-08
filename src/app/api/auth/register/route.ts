import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@/lib/email/resend';

export async function POST(request: NextRequest) {
  const { token, name, email: emailEingabe, password } = await request.json();

  if (!token || !name || !emailEingabe || !password) {
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

  // Registriert wird nur die eingeladene Adresse (weitergeleitete Links reichen nicht für ein fremdes Konto)
  const email = String(invite.email).trim().toLowerCase();
  if (String(emailEingabe).trim().toLowerCase() !== email) {
    return NextResponse.json({ error: 'Bitte die E-Mail-Adresse verwenden, an die die Einladung ging.' }, { status: 400 });
  }

  // Einladung atomar einlösen: nur eine von mehreren parallelen Anfragen bekommt die Zeile
  const { data: eingeloest } = await supabase
    .from('invite_tokens')
    .update({ redeemed: true })
    .eq('id', invite.id)
    .or('redeemed.is.null,redeemed.eq.false')
    .select('id');
  if (!eingeloest?.length) {
    return NextResponse.json({ error: 'Dieser Einladungslink wurde bereits verwendet.' }, { status: 400 });
  }
  const freigeben = () => supabase.from('invite_tokens').update({ redeemed: false }).eq('id', invite.id);

  // Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    await freigeben();
    return NextResponse.json({ error: 'Registrierung fehlgeschlagen: ' + authError.message }, { status: 400 });
  }

  // Create users row
  const { error: userError } = await supabase.from('users').insert({
    id: authData.user.id,
    agency_id: invite.agency_id,
    email,
    name,
    // Rolle aus der Einladung: Inhaber, Mitarbeiter (Innendienst des Kunden) oder nur lesen
    role: ['agency_owner', 'agency_member', 'agency_viewer'].includes(invite.role) ? invite.role : 'agency_owner',
  });

  if (userError) {
    // Rollback: delete auth user
    await supabase.auth.admin.deleteUser(authData.user.id);
    await freigeben();
    return NextResponse.json({ error: 'Benutzer konnte nicht erstellt werden.' }, { status: 500 });
  }


  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login`;
  try {
    await sendWelcomeEmail(email, name, loginUrl);
  } catch {
    // Email failed but registration succeeded
  }

  return NextResponse.json({ success: true });
}
