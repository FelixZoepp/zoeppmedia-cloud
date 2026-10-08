import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@/lib/email/resend';
import { reassignOpenStepsToFunktion } from '@/lib/fulfillment/engine';

export async function POST(request: NextRequest) {
  const { token, name, email: emailEingabe, password, position, phone } = await request.json();

  if (!token || !name || !emailEingabe || !password) {
    return NextResponse.json({ error: 'Alle Pflichtfelder sind erforderlich.' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Passwort muss mindestens 8 Zeichen haben.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Validate employee invite token
  const { data: invite, error: inviteError } = await supabase
    .from('employee_invites')
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
    .from('employee_invites')
    .update({ redeemed: true })
    .eq('id', invite.id)
    .or('redeemed.is.null,redeemed.eq.false')
    .select('id');
  if (!eingeloest?.length) {
    return NextResponse.json({ error: 'Dieser Einladungslink wurde bereits verwendet.' }, { status: 400 });
  }
  const freigeben = () => supabase.from('employee_invites').update({ redeemed: false }).eq('id', invite.id);

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

  // Create users row with employee role
  const { error: userError } = await supabase.from('users').insert({
    id: authData.user.id,
    agency_id: null,
    email,
    name,
    role: 'employee',
    funktion: invite.funktion ?? null,
    position: position?.trim() || null,
    phone: phone?.trim() || null,
  });

  if (userError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    await freigeben();
    return NextResponse.json({ error: 'Benutzer konnte nicht erstellt werden.' }, { status: 500 });
  }

  // Create team_members entry linked to the new user
  await supabase.from('team_members').insert({
    user_id: authData.user.id,
    name,
    position: position?.trim() || null,
  });

  // Fulfillment v2: offene Schritte der eigenen Funktion übernehmen (z.B. Nils = Ads/Funnel)
  if (invite.funktion) {
    await reassignOpenStepsToFunktion(supabase, authData.user.id, invite.funktion).catch((err) =>
      console.error('[register-employee] Schritte übernehmen fehlgeschlagen:', err),
    );
  }


  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login`;
  try {
    await sendWelcomeEmail(email, name, loginUrl);
  } catch {
    // Email failed but registration succeeded
  }

  return NextResponse.json({ success: true });
}
