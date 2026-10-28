import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { istErlaubterPushEndpoint } from '@/lib/security/ssrf';

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
}

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:felixbusinessmail@gmx.de',
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

/**
 * Sendet eine Web-Push-Nachricht an alle Geräte der angegebenen User.
 * Tote Subscriptions (404/410) werden automatisch entfernt.
 */
/** Sind die VAPID-Schlüssel gesetzt? Ohne sie geht keine Push-Nachricht raus. */
export const pushEingerichtet = () => !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  if (userIds.length === 0 || !ensureConfigured()) return 0;

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds);

  if (!subs?.length) return 0;

  const json = JSON.stringify(payload);

  let gesendet = 0;
  await Promise.all(
    subs.map(async (sub) => {
      // Altbestand mit fremden Endpoints nicht beliefern
      if (!istErlaubterPushEndpoint(sub.endpoint)) return;
      try {
        // urgency high: Handy zeigt die Nachricht sofort an (auch im Stromsparmodus), TTL 1 h
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json,
          { urgency: 'high', TTL: 3600 }
        );
        gesendet++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    })
  );
  return gesendet;
}
