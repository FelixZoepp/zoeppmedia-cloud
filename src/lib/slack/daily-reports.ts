import { SupabaseClient } from '@supabase/supabase-js';

const SLACK_API = 'https://slack.com/api/chat.postMessage';

async function postSlack(channel: string, blocks: unknown[], text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;

  await fetch(SLACK_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, blocks, text }),
  });
}

function fmtEur(v: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function fmtEur2(v: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function pct(a: number, b: number): string {
  if (b === 0) return '–';
  return Math.round((a / b) * 100) + '%';
}

function emoji(rate: number, good: number, bad: number): string {
  if (rate >= good) return '🟢';
  if (rate >= bad) return '🟡';
  return '🔴';
}

// ── Marketing Daily Report ──────────────────────────────────────────────────

export async function sendMarketingReport(supabase: SupabaseClient) {
  const channel = process.env.SLACK_MARKETING_CHANNEL;
  if (!channel) return;

  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !adAccountId) return;

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  // Fetch today's Meta data
  const todayRange = JSON.stringify({ since: today, until: today });
  const weekRange = JSON.stringify({ since: weekAgo, until: today });
  const fields = 'spend,impressions,clicks,cpc,ctr,actions';

  const [todayRes, weekRes, adRes] = await Promise.all([
    fetch(`https://graph.facebook.com/v21.0/${adAccountId}/insights?access_token=${token}&time_range=${todayRange}&fields=${fields}&level=account`),
    fetch(`https://graph.facebook.com/v21.0/${adAccountId}/insights?access_token=${token}&time_range=${weekRange}&fields=${fields}&level=account`),
    fetch(`https://graph.facebook.com/v21.0/${adAccountId}/insights?access_token=${token}&time_range=${todayRange}&fields=spend,actions,ad_name&level=ad&limit=10`),
  ]);

  const todayData = await todayRes.json();
  const weekData = await weekRes.json();
  const adData = await adRes.json();

  const t = todayData.data?.[0];
  const w = weekData.data?.[0];

  const getLeads = (d: { actions?: Array<{ action_type: string; value: string }> }) => {
    const a = d?.actions?.find((a: { action_type: string }) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
    return a ? parseInt(a.value) : 0;
  };

  const todaySpend = t ? parseFloat(t.spend || '0') : 0;
  const todayLeads = t ? getLeads(t) : 0;
  const todayCPL = todayLeads > 0 ? todaySpend / todayLeads : 0;
  const todayClicks = t ? parseInt(t.clicks || '0') : 0;
  const todayImpressions = t ? parseInt(t.impressions || '0') : 0;
  const todayCTR = t ? parseFloat(t.ctr || '0') : 0;

  const weekSpend = w ? parseFloat(w.spend || '0') : 0;
  const weekLeads = w ? getLeads(w) : 0;
  const weekCPL = weekLeads > 0 ? weekSpend / weekLeads : 0;

  // Top performing ad
  let topAd = '–';
  let topAdLeads = 0;
  for (const ad of adData.data || []) {
    const leads = getLeads(ad);
    if (leads > topAdLeads) {
      topAdLeads = leads;
      topAd = ad.ad_name || 'Unbekannt';
    }
  }

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📊 Marketing Report — ${new Date().toLocaleDateString('de-DE')}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Spend heute*\n${fmtEur2(todaySpend)}` },
        { type: 'mrkdwn', text: `*Leads heute*\n${todayLeads}` },
        { type: 'mrkdwn', text: `*CPL heute*\n${todayCPL > 0 ? fmtEur2(todayCPL) : '–'}` },
        { type: 'mrkdwn', text: `*CTR*\n${todayCTR.toFixed(2)}%` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Spend 7 Tage*\n${fmtEur2(weekSpend)}` },
        { type: 'mrkdwn', text: `*Leads 7 Tage*\n${weekLeads}` },
        { type: 'mrkdwn', text: `*CPL 7 Tage*\n${weekCPL > 0 ? fmtEur2(weekCPL) : '–'}` },
        { type: 'mrkdwn', text: `*Klicks heute*\n${todayClicks}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `🏆 *Top Creative heute:* ${topAd} (${topAdLeads} Leads)` },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Impressions: ${todayImpressions.toLocaleString('de-DE')} | <https://cloud.zoeppmedia.de/admin/marketing|Dashboard öffnen>` }],
    },
  ];

  await postSlack(channel, blocks, `Marketing Report ${today}: Spend ${fmtEur2(todaySpend)}, ${todayLeads} Leads, CPL ${fmtEur2(todayCPL)}`);
}

// ── Sales Daily Report ──────────────────────────────────────────────────────

export async function sendSalesReport(supabase: SupabaseClient) {
  const channel = process.env.SLACK_SALES_CHANNEL;
  if (!channel) return;

  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) return;

  const PIPELINE_ID = 'pipe_5E14qCHzi8u3cHk0bB44ky';
  const headers = {
    'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
    'Content-Type': 'application/json',
  };

  // Fetch pipeline statuses
  const pipeRes = await fetch(`https://api.close.com/api/v1/pipeline/${PIPELINE_ID}/`, { headers });
  const pipeline = await pipeRes.json();
  const statusMap: Record<string, { label: string; type: string }> = {};
  for (const s of pipeline.statuses ?? []) {
    statusMap[s.id] = { label: s.label, type: s.type ?? 'active' };
  }

  // Fetch all opportunities
  const oppRes = await fetch(`https://api.close.com/api/v1/opportunity/?pipeline_id=${PIPELINE_ID}&_limit=200&_order_by=-date_created`, { headers });
  const oppData = await oppRes.json();
  const opps = oppData.data ?? [];

  // Classify
  let setting = 0, closing = 0, won = 0, lost = 0;
  let wonValue = 0, openValue = 0;
  const todayWon: string[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const o of opps) {
    const info = statusMap[o.status_id] ?? { label: '', type: 'active' };
    const label = info.label.toLowerCase();
    const val = (o.value ?? 0) / 100;

    if (info.type === 'won') {
      won++;
      wonValue += val;
      if (o.date_updated?.startsWith(today)) {
        todayWon.push(`${o.lead_name || '?'} (${fmtEur(val)})`);
      }
    } else if (info.type === 'lost') {
      lost++;
    } else if (label.includes('closing') || label.includes('angebot') || label.includes('cc2')) {
      closing++;
      openValue += val;
    } else {
      setting++;
    }
  }

  const total = opps.length;
  const closingPlus = closing + won;
  const qualiRate = total > 0 ? (closingPlus / total) * 100 : 0;
  const closingRate = closingPlus > 0 ? (won / closingPlus) * 100 : 0;
  const winRate = total > 0 ? (won / total) * 100 : 0;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `💰 Sales Report — ${new Date().toLocaleDateString('de-DE')}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Pipeline D2D* — ${total} Deals` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Setting*\n${setting}` },
        { type: 'mrkdwn', text: `*Closing*\n${closing}` },
        { type: 'mrkdwn', text: `*Won*\n${won} (${fmtEur(wonValue)})` },
        { type: 'mrkdwn', text: `*Lost*\n${lost}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Quali-Rate*\n${emoji(qualiRate, 60, 40)} ${qualiRate.toFixed(1)}%` },
        { type: 'mrkdwn', text: `*Closing-Rate*\n${emoji(closingRate, 40, 25)} ${closingRate.toFixed(1)}%` },
        { type: 'mrkdwn', text: `*Win-Rate*\n${emoji(winRate, 20, 10)} ${winRate.toFixed(1)}%` },
        { type: 'mrkdwn', text: `*Offener Wert*\n${fmtEur(openValue)}` },
      ],
    },
  ];

  if (todayWon.length > 0) {
    blocks.push({ type: 'divider' } as never);
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `🎉 *Closes heute:*\n${todayWon.join('\n')}` },
    } as never);
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `<https://cloud.zoeppmedia.de/admin/sales|Sales Dashboard> | <https://cloud.zoeppmedia.de/admin/report|Funnel Report>` }],
  } as never);

  await postSlack(channel, blocks, `Sales Report: ${won} Won (${fmtEur(wonValue)}), ${setting} Setting, ${closing} Closing`);
}

/**
 * Send both daily reports. Called from the daily cron.
 */
export async function sendDailySlackReports(supabase: SupabaseClient) {
  await Promise.all([
    sendMarketingReport(supabase),
    sendSalesReport(supabase),
  ]);
}
