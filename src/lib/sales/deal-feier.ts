/**
 * Deal-Feier: Sobald in Close eine Opportunity auf „Close“ (gewonnen) geht, wird gefeiert –
 * einmal je Opportunity (Tabelle deal_feiern, opp_id eindeutig):
 * - Slack #sales: Nachricht mit GIF, Closer, Firma, Volumen und Abschluss-Nr. im Monat
 * - Cloud: Vollbild-Animation mit Konfetti + GIF bei allen eingeloggten Mitarbeitern (components/deal-feier.tsx)
 * Ausgelöst vom Close-Webhook (opportunity.created/updated) → Job sales.deal_feier.
 * Rein intern – an Kunden geht nichts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENCY_ID } from './calendly-chain';
import { slackKanal } from '@/lib/slack/kanaele';
import { berlinMonatsStart } from '@/lib/zeit/berlin';
import { UPSELL_STATUS } from './pipelines';

export const OPP_GEWONNEN = 'stat_BFVJiIlomolS2JMTSHc49cHnvh2Rl1IuWnudLEYRh0n';
/** Gewonnen in „D2D Sales“ oder „Upsell (Bestandskunden)“ */
const GEWONNEN_STATUS = new Set([OPP_GEWONNEN, UPSELL_STATUS.gewonnen]);

/** Feier-GIF (von Felix ausgesucht, liegt öffentlich unter public/icons) */
export const FEIER_GIF = 'https://cloud.zoeppmedia.de/icons/deal-feier.gif';

/** Webhook-Ereignis: wurde die Opportunity gerade gewonnen? (rein, testbar) */
export function istGewonnen(ev: { object_type?: string; action?: string; changed_fields?: string[]; data?: { status_id?: string }; previous_data?: { status_id?: string } } | undefined): boolean {
  if (ev?.object_type !== 'opportunity' || !GEWONNEN_STATUS.has(ev.data?.status_id ?? '')) return false;
  if (ev.action === 'created') return true;
  return ev.action === 'updated' && (ev.changed_fields ?? []).includes('status_id') && !GEWONNEN_STATUS.has(ev.previous_data?.status_id ?? '');
}

export async function planeDealFeier(svc: SupabaseClient, oppId: string): Promise<void> {
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.deal_feier',
    run_at: new Date().toISOString(),
    payload: { opp_id: oppId },
    status: 'pending',
    dedupe_key: `sales.deal_feier:${oppId}`,
  });
  if (error && error.code !== '23505') throw new Error(`Deal-Feier nicht geplant: ${error.message}`);
}

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

interface CloseOpp {
  id: string;
  lead_id: string;
  lead_name?: string | null;
  user_name?: string | null;
  status_id: string;
  value: number | null;
}

/** Job sales.deal_feier */
export async function feiereDeal(svc: SupabaseClient, oppId: string): Promise<string> {
  const res = await fetch(`https://api.close.com/api/v1/opportunity/${oppId}/?_fields=id,lead_id,lead_name,user_name,status_id,value`, {
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Close ${res.status}`);
  const opp = (await res.json()) as CloseOpp;
  if (!GEWONNEN_STATUS.has(opp.status_id)) return 'nicht_gewonnen';

  const gif = FEIER_GIF;
  const volumen = (opp.value ?? 0) / 100;
  const closer = opp.user_name?.split(' ')[0] || 'Das Team';
  // Einmal je Opportunity (auch wenn sie wieder auf aktiv und zurück auf gewonnen geht)
  const { error } = await svc.from('deal_feiern').insert({ opp_id: opp.id, lead_id: opp.lead_id, firma: opp.lead_name ?? null, closer, volumen, gif });
  if (error?.code === '23505') return 'schon_gefeiert';
  if (error) throw new Error(error.message);

  const { count } = await svc.from('deal_feiern').select('id', { count: 'exact', head: true }).gte('created_at', berlinMonatsStart().toISOString());
  const monat = new Date().toLocaleDateString('de-DE', { month: 'long', timeZone: 'Europe/Berlin' });

  const kanal = await slackKanal('sales');
  const token = process.env.SLACK_BOT_TOKEN;
  if (kanal && token) {
    const text = `🎉 DEAL! ${closer} hat ${opp.lead_name ?? 'einen neuen Kunden'} abgeschlossen${volumen ? ` – ${eur(volumen)}` : ''}`;
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: '🎉🍾 DEAL GEMACHT! 🍾🎉', emoji: true } },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `🥳 *${closer}* hat *${opp.lead_name ?? 'einen neuen Kunden'}* abgeschlossen!${volumen ? `\n💰 Auftragsvolumen: *${eur(volumen)}*` : ''}\n🏆 Abschluss Nr. *${count ?? 1}* im ${monat}` },
      },
      { type: 'image', image_url: gif, alt_text: 'Deal-Feier' },
      { type: 'context', elements: [{ type: 'mrkdwn', text: '🔥 Weiter so, Team! · <https://cloud.zoeppmedia.de/admin/vertrieb|Sales-Controlling>' }] },
    ];
    const r = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: kanal, text, blocks }),
    });
    const d = (await r.json()) as { ok: boolean; error?: string };
    // Kein Retry (Feier ist gespeichert, sonst doppelte Slack-Posts)
    if (!d.ok) console.error('[deal-feier] Slack:', d.error);
  }
  return 'gefeiert';
}
