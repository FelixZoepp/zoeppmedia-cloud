import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

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
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0 || !ensureConfigured()) return;

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds);

  if (!subs?.length) return;

  const json = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    })
  );
}
