import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { darfKundenCloud } from '@/lib/kunden-cloud/zugriff';
import { NextResponse } from 'next/server';
import { sendInviteEmail } from '@/lib/email/resend';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  // Kunden-Zugänge (Inhaber!) vergeben nur Admin und Innendienst – sonst könnte sich jeder Mitarbeiter in jede Kunden-Cloud einladen
  const user = await getCurrentUser();
  if (!darfKundenCloud(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { agency_id?: unknown; agency_name?: unknown; email?: unknown };
  const agency_id = typeof body.agency_id === 'string' ? body.agency_id : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const agency_name = typeof body.agency_name === 'string' ? body.agency_name : '';

  if (!agency_id || !email) {
    return NextResponse.json({ error: 'Agency ID und E-Mail erforderlich.' }, { status: 400 });
  }
  if (!UUID_RE.test(agency_id)) return NextResponse.json({ error: 'Ungültige Agency ID.' }, { status: 400 });
  if (!MAIL_RE.test(email)) return NextResponse.json({ error: 'Ungültige E-Mail-Adresse.' }, { status: 400 });

  const admin = createAdminClient();

  // Agentur muss existieren
  const { data: agency, error: agencyErr } = await admin.from('agencies').select('id, name').eq('id', agency_id).maybeSingle();
  if (agencyErr) return NextResponse.json({ error: 'Agentur konnte nicht geprüft werden.' }, { status: 500 });
  if (!agency) return NextResponse.json({ error: 'Agentur nicht gefunden.' }, { status: 404 });

  // Alte, noch offene Einladungen derselben E-Mail für diese Agentur entwerten (nur der neue Link gilt)
  const jetzt = new Date().toISOString();
  const { error: altErr } = await admin
    .from('invite_tokens')
    .update({ expires_at: jetzt })
    .eq('agency_id', agency_id)
    .ilike('email', email.replace(/[\\%_]/g, (z) => `\\${z}`))
    .eq('redeemed', false)
    .gt('expires_at', jetzt);
  if (altErr) return NextResponse.json({ error: 'Alte Einladungen konnten nicht entwertet werden.' }, { status: 500 });

  const { data: invite, error: inviteErr } = await admin
    .from('invite_tokens')
    .insert({ agency_id, email, invited_by: user?.id ?? null })
    .select('id, token')
    .single();
  if (inviteErr || !invite) {
    console.error('[admin/invite] Einladung nicht angelegt', inviteErr?.message);
    return NextResponse.json({ error: 'Einladung konnte nicht angelegt werden.' }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const invite_url = `${baseUrl}/register/${invite.token}`;

  let email_gesendet = false;
  try {
    const expiresAt = new Date(Date.now() + 7 * 86400000).toLocaleDateString('de-DE');
    await sendInviteEmail(email, agency_name || (agency as { name: string | null }).name || email, invite_url, expiresAt, 'inhaber');
    await admin
      .from('invite_tokens')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', invite.id);
    email_gesendet = true;
  } catch (e) {
    // Mail fehlgeschlagen, Einladung existiert – Link wird zurückgegeben
    console.error('[admin/invite] Einladungs-Mail fehlgeschlagen', e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ invite_url, email_gesendet });
}
