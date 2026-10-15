import type { SupabaseClient } from '@supabase/supabase-js';
import { sendInviteEmail } from '@/lib/email/resend';

export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/** Einladungs-Mail verschicken und Versandzeit merken. Liefert false, wenn die Mail nicht rausging. */
export async function sendeEinladung(
  svc: SupabaseClient,
  agencyId: string,
  invite: { id: string; token: string; expires_at: string; email: string },
): Promise<boolean> {
  const [{ data: agency }, { data: tok }] = await Promise.all([
    svc.from('agencies').select('name').eq('id', agencyId).maybeSingle(),
    svc.from('invite_tokens').select('role').eq('id', invite.id).maybeSingle(),
  ]);
  const rolle = (tok as { role: string | null } | null)?.role ?? 'agency_owner';
  try {
    await sendInviteEmail(
      invite.email,
      (agency as { name: string } | null)?.name ?? 'Recruiting Cloud',
      `${appUrl()}/register/${invite.token}`,
      new Date(invite.expires_at).toLocaleDateString('de-DE'),
      rolle === 'agency_owner' ? 'inhaber' : 'team',
    );
    await svc.from('invite_tokens').update({ email_sent_at: new Date().toISOString() }).eq('id', invite.id);
    return true;
  } catch {
    return false;
  }
}
