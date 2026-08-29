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

// ── Weekly Marketing Report (Sonntag) ───────────────────────────────────────

export async function sendWeeklyMarketingReport(supabase: SupabaseClient) {
  const channel = process.env.SLACK_MARKETING_CHANNEL;
  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!channel || !token || !adAccountId) return;

  const now = new Date();
  const weekEnd = now.toISOString().split('T')[0];
  const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const prevWeekStart = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0];

  const fields = 'spend,impressions,clicks,cpc,ctr,actions';

  const [thisWeekRes, prevWeekRes, adRes] = await Promise.all([
    fetch(`https://graph.facebook.com/v21.0/${adAccountId}/insights?access_token=${token}&time_range=${JSON.stringify({ since: weekStart, until: weekEnd })}&fields=${fields}&level=account`),
    fetch(`https://graph.facebook.com/v21.0/${adAccountId}/insights?access_token=${token}&time_range=${JSON.stringify({ since: prevWeekStart, until: weekStart })}&fields=${fields}&level=account`),
    fetch(`https://graph.facebook.com/v21.0/${adAccountId}/insights?access_token=${token}&time_range=${JSON.stringify({ since: weekStart, until: weekEnd })}&fields=spend,actions,ad_name&level=ad&limit=5`),
  ]);

  const thisWeek = (await thisWeekRes.json()).data?.[0];
  const prevWeek = (await prevWeekRes.json()).data?.[0];
  const ads = (await adRes.json()).data ?? [];

  const getLeads = (d: { actions?: Array<{ action_type: string; value: string }> }) => {
    const a = d?.actions?.find((a: { action_type: string }) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
    return a ? parseInt(a.value) : 0;
  };

  const tw = {
    spend: thisWeek ? parseFloat(thisWeek.spend || '0') : 0,
    leads: thisWeek ? getLeads(thisWeek) : 0,
    clicks: thisWeek ? parseInt(thisWeek.clicks || '0') : 0,
    impressions: thisWeek ? parseInt(thisWeek.impressions || '0') : 0,
    ctr: thisWeek ? parseFloat(thisWeek.ctr || '0') : 0,
  };
  const pw = {
    spend: prevWeek ? parseFloat(prevWeek.spend || '0') : 0,
    leads: prevWeek ? getLeads(prevWeek) : 0,
  };

  const twCPL = tw.leads > 0 ? tw.spend / tw.leads : 0;
  const pwCPL = pw.leads > 0 ? pw.spend / pw.leads : 0;
  const delta = (curr: number, prev: number) => {
    if (prev === 0) return '';
    const d = ((curr - prev) / prev) * 100;
    return d >= 0 ? ` (↑${Math.abs(d).toFixed(0)}%)` : ` (↓${Math.abs(d).toFixed(0)}%)`;
  };

  // Top 3 creatives
  const topAds = ads
    .map((a: { ad_name?: string; spend?: string; actions?: Array<{ action_type: string; value: string }> }) => ({
      name: a.ad_name || '?',
      leads: getLeads(a),
      spend: parseFloat(a.spend || '0'),
    }))
    .sort((a: { leads: number }, b: { leads: number }) => b.leads - a.leads)
    .slice(0, 3);

  const topAdsText = topAds
    .filter((a: { leads: number }) => a.leads > 0)
    .map((a: { name: string; leads: number; spend: number }, i: number) => `${i + 1}. ${a.name} — ${a.leads} Leads (${fmtEur2(a.spend)})`)
    .join('\n') || 'Keine Leads diese Woche';

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📊 Wochenreport Marketing — KW ${getWeekNumber(now)}` } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Spend*\n${fmtEur2(tw.spend)}${delta(tw.spend, pw.spend)}` },
        { type: 'mrkdwn', text: `*Leads*\n${tw.leads}${delta(tw.leads, pw.leads)}` },
        { type: 'mrkdwn', text: `*CPL*\n${twCPL > 0 ? fmtEur2(twCPL) : '–'}${delta(twCPL, pwCPL)}` },
        { type: 'mrkdwn', text: `*CTR*\n${tw.ctr.toFixed(2)}%` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Klicks*\n${tw.clicks.toLocaleString('de-DE')}` },
        { type: 'mrkdwn', text: `*Impressions*\n${tw.impressions.toLocaleString('de-DE')}` },
      ],
    },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `🏆 *Top Creatives der Woche:*\n${topAdsText}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Vorwoche: ${fmtEur2(pw.spend)} Spend, ${pw.leads} Leads | <https://cloud.zoeppmedia.de/admin/marketing|Dashboard>` }] },
  ];

  await postSlack(channel, blocks, `Wochenreport Marketing KW${getWeekNumber(now)}: ${fmtEur2(tw.spend)} Spend, ${tw.leads} Leads`);
}

// ── Weekly Sales Report (Sonntag) ───────────────────────────────────────────

export async function sendWeeklySalesReport(supabase: SupabaseClient) {
  const channel = process.env.SLACK_SALES_CHANNEL;
  const apiKey = process.env.CLOSE_API_KEY;
  if (!channel || !apiKey) return;

  const PIPELINE_ID = 'pipe_5E14qCHzi8u3cHk0bB44ky';
  const headers = {
    'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
    'Content-Type': 'application/json',
  };

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];

  // Fetch pipeline
  const pipeRes = await fetch(`https://api.close.com/api/v1/pipeline/${PIPELINE_ID}/`, { headers });
  const pipeline = await pipeRes.json();
  const statusMap: Record<string, { label: string; type: string }> = {};
  for (const s of pipeline.statuses ?? []) {
    statusMap[s.id] = { label: s.label, type: s.type ?? 'active' };
  }

  const oppRes = await fetch(`https://api.close.com/api/v1/opportunity/?pipeline_id=${PIPELINE_ID}&_limit=200`, { headers });
  const opps = (await oppRes.json()).data ?? [];

  let setting = 0, closing = 0, won = 0, lost = 0, wonValue = 0, openValue = 0;
  const weekWon: string[] = [];

  for (const o of opps) {
    const info = statusMap[o.status_id] ?? { label: '', type: 'active' };
    const label = info.label.toLowerCase();
    const val = (o.value ?? 0) / 100;

    if (info.type === 'won') {
      won++; wonValue += val;
      if (o.date_created >= weekStart || o.date_updated >= weekStart) {
        weekWon.push(`• ${o.lead_name || '?'} — ${fmtEur(val)}`);
      }
    } else if (info.type === 'lost') { lost++; }
    else if (label.includes('closing') || label.includes('angebot') || label.includes('cc2')) {
      closing++; openValue += val;
    } else { setting++; }
  }

  const total = opps.length;
  const closingPlus = closing + won;
  const qualiRate = total > 0 ? (closingPlus / total) * 100 : 0;
  const closingRate = closingPlus > 0 ? (won / closingPlus) * 100 : 0;
  const winRate = total > 0 ? (won / total) * 100 : 0;

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: `💰 Wochenreport Sales — KW ${getWeekNumber(now)}` } },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*D2D Pipeline* — ${total} Deals total` },
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

  if (weekWon.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `🎉 *Closes diese Woche:*\n${weekWon.join('\n')}` } });
  }

  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `<https://cloud.zoeppmedia.de/admin/sales|Sales Dashboard> | <https://cloud.zoeppmedia.de/admin/wochenbericht|Wochenbericht>` }] });

  await postSlack(channel, blocks as never[], `Wochenreport Sales KW${getWeekNumber(now)}: ${won} Won (${fmtEur(wonValue)})`);
}

// ── Monthly Reports (letzter Tag des Monats) ────────────────────────────────

export async function sendMonthlyMarketingReport(supabase: SupabaseClient) {
  const channel = process.env.SLACK_MARKETING_CHANNEL;
  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!channel || !token || !adAccountId) return;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const monthEnd = now.toISOString().split('T')[0];
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
  const monthName = now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  const fields = 'spend,impressions,clicks,cpc,ctr,actions';

  const [thisRes, prevRes] = await Promise.all([
    fetch(`https://graph.facebook.com/v21.0/${adAccountId}/insights?access_token=${token}&time_range=${JSON.stringify({ since: monthStart, until: monthEnd })}&fields=${fields}&level=account`),
    fetch(`https://graph.facebook.com/v21.0/${adAccountId}/insights?access_token=${token}&time_range=${JSON.stringify({ since: prevMonthStart, until: prevMonthEnd })}&fields=${fields}&level=account`),
  ]);

  const thisMonth = (await thisRes.json()).data?.[0];
  const prevMonth = (await prevRes.json()).data?.[0];

  const getLeads = (d: { actions?: Array<{ action_type: string; value: string }> }) => {
    const a = d?.actions?.find((a: { action_type: string }) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
    return a ? parseInt(a.value) : 0;
  };

  const tm = {
    spend: thisMonth ? parseFloat(thisMonth.spend || '0') : 0,
    leads: thisMonth ? getLeads(thisMonth) : 0,
    clicks: thisMonth ? parseInt(thisMonth.clicks || '0') : 0,
    impressions: thisMonth ? parseInt(thisMonth.impressions || '0') : 0,
    ctr: thisMonth ? parseFloat(thisMonth.ctr || '0') : 0,
  };
  const pm = {
    spend: prevMonth ? parseFloat(prevMonth.spend || '0') : 0,
    leads: prevMonth ? getLeads(prevMonth) : 0,
  };

  const tmCPL = tm.leads > 0 ? tm.spend / tm.leads : 0;
  const pmCPL = pm.leads > 0 ? pm.spend / pm.leads : 0;
  const delta = (curr: number, prev: number) => {
    if (prev === 0) return '';
    const d = ((curr - prev) / prev) * 100;
    return d >= 0 ? ` (↑${Math.abs(d).toFixed(0)}%)` : ` (↓${Math.abs(d).toFixed(0)}%)`;
  };

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📊 Monatsreport Marketing — ${monthName}` } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Spend*\n${fmtEur2(tm.spend)}${delta(tm.spend, pm.spend)}` },
        { type: 'mrkdwn', text: `*Leads*\n${tm.leads}${delta(tm.leads, pm.leads)}` },
        { type: 'mrkdwn', text: `*CPL*\n${tmCPL > 0 ? fmtEur2(tmCPL) : '–'}${delta(tmCPL, pmCPL)}` },
        { type: 'mrkdwn', text: `*CTR*\n${tm.ctr.toFixed(2)}%` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Klicks*\n${tm.clicks.toLocaleString('de-DE')}` },
        { type: 'mrkdwn', text: `*Impressions*\n${tm.impressions.toLocaleString('de-DE')}` },
      ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Vormonat: ${fmtEur2(pm.spend)} Spend, ${pm.leads} Leads | <https://cloud.zoeppmedia.de/admin/marketing|Dashboard>` }] },
  ];

  await postSlack(channel, blocks, `Monatsreport Marketing ${monthName}: ${fmtEur2(tm.spend)} Spend, ${tm.leads} Leads`);
}

export async function sendMonthlySalesReport(supabase: SupabaseClient) {
  const channel = process.env.SLACK_SALES_CHANNEL;
  const apiKey = process.env.CLOSE_API_KEY;
  if (!channel || !apiKey) return;

  const PIPELINE_ID = 'pipe_5E14qCHzi8u3cHk0bB44ky';
  const headers = {
    'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
    'Content-Type': 'application/json',
  };

  const now = new Date();
  const monthName = now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  const pipeRes = await fetch(`https://api.close.com/api/v1/pipeline/${PIPELINE_ID}/`, { headers });
  const pipeline = await pipeRes.json();
  const statusMap: Record<string, { label: string; type: string }> = {};
  for (const s of pipeline.statuses ?? []) {
    statusMap[s.id] = { label: s.label, type: s.type ?? 'active' };
  }

  const oppRes = await fetch(`https://api.close.com/api/v1/opportunity/?pipeline_id=${PIPELINE_ID}&_limit=200`, { headers });
  const opps = (await oppRes.json()).data ?? [];

  let won = 0, wonValue = 0, total = opps.length, setting = 0, closing = 0, lost = 0;

  for (const o of opps) {
    const info = statusMap[o.status_id] ?? { label: '', type: 'active' };
    const label = info.label.toLowerCase();
    const val = (o.value ?? 0) / 100;
    if (info.type === 'won') { won++; wonValue += val; }
    else if (info.type === 'lost') { lost++; }
    else if (label.includes('closing') || label.includes('angebot') || label.includes('cc2')) { closing++; }
    else { setting++; }
  }

  const winRate = total > 0 ? (won / total) * 100 : 0;

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `💰 Monatsreport Sales — ${monthName}` } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Deals total*\n${total}` },
        { type: 'mrkdwn', text: `*Won*\n${won}` },
        { type: 'mrkdwn', text: `*Umsatz*\n${fmtEur(wonValue)}` },
        { type: 'mrkdwn', text: `*Win-Rate*\n${emoji(winRate, 20, 10)} ${winRate.toFixed(1)}%` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Setting*\n${setting}` },
        { type: 'mrkdwn', text: `*Closing*\n${closing}` },
        { type: 'mrkdwn', text: `*Lost*\n${lost}` },
        { type: 'mrkdwn', text: `*Cost/Kunde*\nsiehe Dashboard` },
      ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `<https://cloud.zoeppmedia.de/admin/sales|Sales Dashboard> | <https://cloud.zoeppmedia.de/admin/wochenbericht|Wochenbericht>` }] },
  ];

  await postSlack(channel, blocks, `Monatsreport Sales ${monthName}: ${won} Won, ${fmtEur(wonValue)} Umsatz`);
}

function getWeekNumber(d: Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

/**
 * Send daily + conditional weekly/monthly reports. Called from the daily cron.
 */
export async function sendDailySlackReports(supabase: SupabaseClient) {
  const now = new Date();

  // Daily reports — every day
  await Promise.all([
    sendMarketingReport(supabase),
    sendSalesReport(supabase),
  ]);

  // Weekly reports — Sonntag
  if (now.getDay() === 0) {
    await Promise.all([
      sendWeeklyMarketingReport(supabase),
      sendWeeklySalesReport(supabase),
    ]);
  }

  // Monthly reports — letzter Tag des Monats
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (tomorrow.getMonth() !== now.getMonth()) {
    await Promise.all([
      sendMonthlyMarketingReport(supabase),
      sendMonthlySalesReport(supabase),
    ]);
  }
}
