/**
 * Sales-Bot: Hinweise an das Team — als App-Benachrichtigung (Push) und
 * im Slack-Kanal #03-sales (SLACK_SALES_CHANNEL).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotificationForInternals, type NotificationType } from '@/lib/notifications/create';
import { SALES_AGENCY_ID } from './calendly-chain';

export interface SalesNotice {
  emoji: string;
  title: string;
  body: string;
  type: NotificationType;
  /** Telefonnummer des Leads (E.164) — in Slack als eigene Zeile */
  phone?: string | null;
  /** Konversation in der Sales-Inbox → Button "Chat öffnen" */
  conversationId?: string | null;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://cloud.zoeppmedia.de').replace(/\/$/, '');
}

function inboxPath(conversationId: string): string {
  return `/api/admin/sales-inbox?conversation=${conversationId}`;
}

/** Slack-Nachricht (Block Kit) für einen Sales-Hinweis bauen. */
export function buildSalesSlackMessage(n: SalesNotice): { text: string; blocks: unknown[] } {
  const lines = [`${n.emoji} *${n.title}*`, n.body];
  if (n.phone) lines.push(`📱 ${n.phone}`);

  const blocks: unknown[] = [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }];
  if (n.conversationId) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Chat öffnen' },
          url: `${appUrl()}${inboxPath(n.conversationId)}`,
        },
      ],
    });
  }
  return { text: `${n.emoji} ${n.title}: ${n.body}`, blocks };
}

export async function postSalesSlack(n: SalesNotice): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_SALES_CHANNEL?.trim();
  if (!token || !channel) return;

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, ...buildSalesSlackMessage(n), unfurl_links: false }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!data.ok) throw new Error(`Slack-Post fehlgeschlagen: ${data.error ?? res.status}`);
}

/** Hinweis an das Team: Push in der App + Slack #03-sales. Fehler werden nur geloggt. */
export async function notifySales(svc: SupabaseClient, n: SalesNotice): Promise<void> {
  await Promise.all([
    createNotificationForInternals(svc, {
      agency_id: SALES_AGENCY_ID,
      title: `Sales: ${n.title}`,
      body: n.body,
      type: n.type,
      ...(n.conversationId ? { push_url: inboxPath(n.conversationId) } : {}),
    }).catch((err) => console.error('[sales] App-Benachrichtigung fehlgeschlagen:', err)),
    postSalesSlack(n).catch((err) => console.error('[sales] Slack fehlgeschlagen:', err)),
  ]);
}
