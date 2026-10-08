/**
 * Eigene Vertriebs-Funnels (Perspective) → Lead in Close.
 * Ersetzt die Zapier-Strecke: Lead anlegen (oder vorhandenen per E-Mail/Telefon finden),
 * UTM-Felder + Leadquelle setzen, Funnel-Antworten als Notiz. Alles Weitere (10-Min-Check,
 * Calendly-Buchung, Bestätigungen) läuft über den vorhandenen Close-Webhook lead.created.
 */

import { createHmac } from 'crypto';
import { addCloseNote, findCloseLeadId } from './close';
import { DATUM_EINTRAGUNG_CF, LEADQUELLE_CF, UTM_CF, leadquelleAusUtm } from './leadquelle';

const CLOSE_BASE = 'https://api.close.com/api/v1';
const PIPELINE_ID = 'pipe_5E14qCHzi8u3cHk0bB44ky'; // D2D Sales
const OPP_SETTING_TERMINIERT = 'stat_ijQBHlkm3ij7uu8hnszgMzR3eIvWVKMo6vkrIVGyKBH';
const LEAD_STATUS_LEADPOOL = 'stat_sgDNPr29uwT7tMPTxzQKW6DDCjbM2JMZzdX3UpeRGLb';
const LEAD_STATUS_SETTING = 'stat_E0PMV0VE8R9KIyqq8aGpBMyvBqjmaih50lXRczPpQ2L';

/** Geheimer URL-Token für den Funnel-Webhook, abgeleitet aus CRON_SECRET (keine extra Env-Variable). */
export function salesFunnelWebhookToken(): string | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update('sales-funnel-webhook').digest('hex').slice(0, 32);
}

export interface FunnelLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  funnelName: string | null;
  utm: { source: string | null; medium: string | null; campaign: string | null; content: string | null };
  /** Weitere Antworten aus dem Funnel (Frage → Antwort) */
  antworten: Array<{ frage: string; antwort: string }>;
}

const KONTAKT_FELDER = new Set(['name', 'firstname', 'lastname', 'vorname', 'nachname', 'email', 'e-mail', 'phone', 'telefon', 'telefonnummer']);

function wert(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(wert).filter(Boolean).join(', ') || null;
  if (v && typeof v === 'object' && 'value' in v) return wert((v as { value: unknown }).value);
  return null;
}

/** utm_* irgendwo im Payload finden (meta, tracking, query, URL-Parameter …) */
function sucheUtm(body: unknown, key: string, tiefe = 0): string | null {
  if (!body || typeof body !== 'object' || tiefe > 4) return null;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    const norm = k.toLowerCase().replace(/[^a-z]/g, '');
    if (norm === `utm${key}`) {
      const w = wert(v);
      if (w) return w;
    }
    if (typeof v === 'string' && /^https?:\/\//.test(v) && v.includes('utm_')) {
      try {
        const p = new URL(v).searchParams.get(`utm_${key}`);
        if (p) return p;
      } catch {
        /* keine URL */
      }
    }
  }
  for (const v of Object.values(body as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      const w = sucheUtm(v, key, tiefe + 1);
      if (w) return w;
    }
  }
  return null;
}

/** Perspective-Payload ({ funnelName, meta, profile: { feld: { value, title } } }) oder flachen Body lesen */
export function leseFunnelLead(body: Record<string, unknown>, query?: URLSearchParams): FunnelLead {
  const profile = (body.profile && typeof body.profile === 'object' ? body.profile : body) as Record<string, unknown>;
  const feld = (...keys: string[]) => {
    for (const k of keys) {
      const w = wert(profile[k]) ?? wert(body[k]);
      if (w) return w;
    }
    return null;
  };

  const vorname = feld('firstName', 'firstname', 'vorname');
  const nachname = feld('lastName', 'lastname', 'nachname');
  const name = feld('name', 'fullName') ?? ([vorname, nachname].filter(Boolean).join(' ') || null);

  const antworten: FunnelLead['antworten'] = [];
  if (body.profile && typeof body.profile === 'object') {
    for (const [k, v] of Object.entries(profile)) {
      if (KONTAKT_FELDER.has(k.toLowerCase()) || k.toLowerCase().startsWith('utm')) continue;
      const antwort = wert(v);
      if (!antwort) continue;
      const titel = v && typeof v === 'object' && 'title' in v ? wert((v as { title: unknown }).title) : null;
      antworten.push({ frage: titel ?? k, antwort });
    }
  }

  const utm = (key: string) => query?.get(`utm_${key}`) || sucheUtm(body, key);
  return {
    name,
    email: feld('email', 'e-mail', 'mail'),
    phone: feld('phone', 'telefon', 'telefonnummer', 'phoneNumber'),
    funnelName: wert(body.funnelName) ?? wert(body.funnel_name) ?? query?.get('funnel') ?? null,
    utm: { source: utm('source'), medium: utm('medium'), campaign: utm('campaign'), content: utm('content') },
    antworten,
  };
}

function closeHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`, 'Content-Type': 'application/json' };
}

function notizText(l: FunnelLead, bestehend: boolean): string {
  const zeilen = [`${bestehend ? 'Erneute Eintragung' : 'Eintragung'} über Funnel${l.funnelName ? ` „${l.funnelName}“` : ''}`];
  const utm = Object.entries(l.utm).filter(([, v]) => v);
  if (utm.length) zeilen.push(utm.map(([k, v]) => `utm_${k}: ${v}`).join(' · '));
  if (l.antworten.length) zeilen.push('', ...l.antworten.map((a) => `${a.frage}: ${a.antwort}`));
  return zeilen.join('\n');
}

/** Lead in Close anlegen bzw. vorhandenen Lead ergänzen. */
export async function uebernehmeFunnelLead(l: FunnelLead): Promise<{ leadId: string; neu: boolean }> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) throw new Error('CLOSE_API_KEY fehlt');

  const vorhanden = await findCloseLeadId({ email: l.email, phone: l.phone });
  if (vorhanden) {
    await addCloseNote(vorhanden, notizText(l, true));
    return { leadId: vorhanden, neu: false };
  }

  const quelle = leadquelleAusUtm({ utmSource: l.utm.source, utmMedium: l.utm.medium, utmCampaign: l.utm.campaign }) ?? `Perspective-Funnel${l.funnelName ? ` – ${l.funnelName}` : ''}`;
  const custom: Record<string, string> = { [`custom.${LEADQUELLE_CF}`]: quelle };
  if (l.utm.source) custom[`custom.${UTM_CF.source}`] = l.utm.source;
  if (l.utm.medium) custom[`custom.${UTM_CF.medium}`] = l.utm.medium;
  if (l.utm.campaign) custom[`custom.${UTM_CF.campaign}`] = l.utm.campaign;
  if (l.utm.content) custom[`custom.${UTM_CF.content}`] = l.utm.content;

  const res = await fetch(`${CLOSE_BASE}/lead/`, {
    method: 'POST',
    headers: closeHeaders(apiKey),
    body: JSON.stringify({
      name: l.name ?? l.email ?? l.phone,
      contacts: [
        {
          name: l.name ?? undefined,
          emails: l.email ? [{ email: l.email, type: 'office' }] : [],
          phones: l.phone ? [{ phone: l.phone, type: 'mobile' }] : [],
        },
      ],
      status_id: LEAD_STATUS_LEADPOOL,
      ...custom,
    }),
  });
  if (!res.ok) throw new Error(`Close-Lead nicht angelegt (${res.status}): ${await res.text()}`);
  const leadId = ((await res.json()) as { id: string }).id;

  // „Datum Eintragung“ markiert den Lead als Funnel-Lead (→ 10-Min-Check). Feldtyp Datum oder Datum+Zeit – beides versuchen.
  const jetzt = new Date().toISOString();
  for (const datum of [jetzt, jetzt.slice(0, 10)]) {
    const put = await fetch(`${CLOSE_BASE}/lead/${leadId}/`, {
      method: 'PUT',
      headers: closeHeaders(apiKey),
      body: JSON.stringify({ [`custom.${DATUM_EINTRAGUNG_CF}`]: datum }),
    });
    if (put.ok) break;
  }

  // Funnel-Antworten in die gleichnamigen Close-Felder (wie bisher über Zapier) – einzeln, damit ein Auswahlfeld mit
  // unbekanntem Wert nicht alles blockiert
  for (const [feldId, antwort] of await ordneAntwortenZu(apiKey, l.antworten)) {
    await fetch(`${CLOSE_BASE}/lead/${leadId}/`, {
      method: 'PUT',
      headers: closeHeaders(apiKey),
      body: JSON.stringify({ [`custom.${feldId}`]: antwort }),
    }).catch(() => null);
  }

  await addCloseNote(leadId, notizText(l, false)).catch((e) => console.error('[funnel-lead] Notiz fehlgeschlagen:', e));
  return { leadId, neu: true };
}

const normFeld = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/** Antworten den Close-Lead-Feldern mit gleichem Namen zuordnen (Frage-Titel = Feldname) */
async function ordneAntwortenZu(apiKey: string, antworten: FunnelLead['antworten']): Promise<Array<[string, string]>> {
  if (!antworten.length) return [];
  const res = await fetch(`${CLOSE_BASE}/custom_field/lead/?_limit=200&_fields=id,name`, { headers: closeHeaders(apiKey) });
  if (!res.ok) return [];
  const felder = ((await res.json()) as { data: Array<{ id: string; name: string }> }).data;
  const nachName = new Map(felder.map((f) => [normFeld(f.name), f.id]));
  return antworten.flatMap((a) => {
    const id = nachName.get(normFeld(a.frage));
    return id && id !== LEADQUELLE_CF ? [[id, a.antwort] as [string, string]] : [];
  });
}

export interface BuchungFuerClose {
  name: string;
  email: string | null;
  phone: string | null;
  startTime: string;
  calendlyEventId: string;
}

/**
 * Job sales.close_buchung (kurz nach der Calendly-Buchung): Lead in Close finden – fehlt er, anlegen –,
 * Lead-Status „Setting“ und Opportunity „Setting – Terminiert“ (nur wenn noch keine aktive Opportunity existiert).
 */
export async function bucheSettingInClose(b: BuchungFuerClose): Promise<{ leadId: string; opportunity: 'angelegt' | 'vorhanden' }> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) throw new Error('CLOSE_API_KEY fehlt');

  let leadId = await findCloseLeadId({ email: b.email, phone: b.phone });
  if (!leadId) {
    const res = await fetch(`${CLOSE_BASE}/lead/`, {
      method: 'POST',
      headers: closeHeaders(apiKey),
      body: JSON.stringify({
        name: b.name,
        status_id: LEAD_STATUS_SETTING,
        contacts: [{ name: b.name, emails: b.email ? [{ email: b.email, type: 'office' }] : [], phones: b.phone ? [{ phone: b.phone, type: 'mobile' }] : [] }],
        [`custom.${LEADQUELLE_CF}`]: 'Calendly-Buchung (ohne Funnel-Eintrag)',
      }),
    });
    if (!res.ok) throw new Error(`Close-Lead nicht angelegt (${res.status}): ${await res.text()}`);
    leadId = ((await res.json()) as { id: string }).id;
  } else {
    await fetch(`${CLOSE_BASE}/lead/${leadId}/`, { method: 'PUT', headers: closeHeaders(apiKey), body: JSON.stringify({ status_id: LEAD_STATUS_SETTING }) });
  }

  const offen = await fetch(`${CLOSE_BASE}/opportunity/?lead_id=${leadId}&status_type=active&_fields=id`, { headers: closeHeaders(apiKey) });
  if (!offen.ok) throw new Error(`Close-Opportunities nicht lesbar (${offen.status})`);
  if (((await offen.json()) as { data: unknown[] }).data.length > 0) return { leadId, opportunity: 'vorhanden' };

  const termin = new Date(b.startTime).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const opp = await fetch(`${CLOSE_BASE}/opportunity/`, {
    method: 'POST',
    headers: closeHeaders(apiKey),
    body: JSON.stringify({ lead_id: leadId, pipeline_id: PIPELINE_ID, status_id: OPP_SETTING_TERMINIERT, note: `Setting gebucht über Calendly: ${termin} Uhr` }),
  });
  if (!opp.ok) throw new Error(`Opportunity nicht angelegt (${opp.status}): ${await opp.text()}`);
  return { leadId, opportunity: 'angelegt' };
}
