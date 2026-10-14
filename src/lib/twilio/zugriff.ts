import type { SupabaseClient } from '@supabase/supabase-js';
import { isInternal, type CurrentUser } from '@/lib/auth';
import { istFreigegeben } from '@/lib/freigaben';
import { normalizePhoneE164 } from '@/lib/phone';
import { canWriteRole } from '@/lib/recruiting/scope';
import { oeffentlicheBasis, twilioConfig, type TwilioConfig } from './config';
import { signaturGueltig } from './signatur';

type Nutzer = Pick<CurrentUser, 'id' | 'role' | 'agency_id'>;

/** Darf diese Person im Browser telefonieren? Vor der Freigabe nur Admins (Test mit eigenem Account). */
export async function telefonieGrund(svc: SupabaseClient, user: Nutzer | null): Promise<string | null> {
  if (!user) return 'Nicht angemeldet';
  if (!twilioConfig()) return 'Twilio ist noch nicht eingerichtet';
  if (!isInternal(user.role) && !canWriteRole(user.role)) return 'Nur Lesezugriff';
  if (user.role !== 'admin' && !(await istFreigegeben(svc, 'telefonie'))) return 'Telefonieren über die Cloud ist noch nicht freigegeben';
  return null;
}

/** Darf diese Person diesen Bewerber anrufen? (rein, testbar) */
export function darfBewerberAnrufen(
  user: Nutzer,
  c: { agency_id: string; phone: string | null; blacklisted?: boolean | null; deleted_at?: string | null; do_not_contact?: boolean | null },
): string | null {
  if (!isInternal(user.role) && user.agency_id !== c.agency_id) return 'Kein Zugriff auf diesen Bewerber';
  if (c.blacklisted || c.deleted_at || c.do_not_contact) return 'Dieser Bewerber darf nicht kontaktiert werden';
  if (!normalizePhoneE164(c.phone)) return 'Keine gültige Nummer hinterlegt';
  return null;
}

/** Twilio-Webhook lesen und Signatur prüfen. null = ungültig oder nicht eingerichtet */
export async function leseTwilioWebhook(req: Request): Promise<{ cfg: TwilioConfig; p: Record<string, string>; url: URL } | null> {
  const cfg = twilioConfig();
  if (!cfg) return null;
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  if (!form) return null;
  const p: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === 'string') p[k] = v;
  });
  // Twilio signiert die öffentliche URL – hinter Vercel kann req.url abweichen, daher aus der festen Basis bauen
  const signiert = `${oeffentlicheBasis()}${url.pathname}${url.search}`;
  if (!signaturGueltig(cfg.authToken, signiert, p, req.headers.get('x-twilio-signature'))) return null;
  return { cfg, p, url };
}

export function xml(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
}
