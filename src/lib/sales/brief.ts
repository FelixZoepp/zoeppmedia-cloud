/**
 * „Brief an die Vertriebsleiter“ – Funnel-Seite auf der Felix-Zoepp-Website (/brief).
 *   - Öffnen / bis zum Ende gelesen → sales_brief_events (echte Zähler auf der Seite)
 *   - Persönlicher Link ?l=<Token> (Follow-up an Leads, signiert) → Notiz am Close-Lead „hat den Brief geöffnet / zu Ende gelesen“
 *   - Fragen am Ende (Branche, Rolle, Team, Ziel, Kontakt) → Close-Lead wie eine Funnel-Eintragung (uebernehmeFunnelLead):
 *     10-Min-Check, Eintrag-Kette und Speed-Alarm laufen wie bei jedem Funnel-Lead. Danach Calendly (Setting).
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FunnelLead } from './funnel-lead';
import { BOOKING_URLS } from './tracking';

export const BRIEF_FUNNEL = 'Brief – Vertriebsleiter';
/** Unter dieser Zahl zeigt die Seite keinen Zähler (wirkt sonst leer) */
export const BRIEF_MIN_ANZEIGE = 50;

/** Seiten, die den Brief einbinden dürfen (CORS) */
export const BRIEF_ORIGINS = [
  'https://felixzoepp.de',
  'https://www.felixzoepp.de',
  'https://brief.felixzoepp.de',
  'https://felix-zoepp-website.vercel.app',
];

export function briefOriginErlaubt(origin: string | null): boolean {
  if (!origin) return false;
  if (BRIEF_ORIGINS.includes(origin)) return true;
  // Vorschau-Deployments der Website + lokal
  return /^https:\/\/felix-zoepp-website-[a-z0-9-]+\.vercel\.app$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin);
}

/* ── Persönlicher Link (?l=) ───────────────────────────────────── */

function sign(leadId: string): string | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(`sales-brief:${leadId}`).digest('base64url').slice(0, 16);
}

export function briefToken(leadId: string): string {
  const sig = sign(leadId);
  if (!sig) throw new Error('CRON_SECRET fehlt — Brief-Link kann nicht signiert werden');
  return `${leadId}.${sig}`;
}

export function leseBriefToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [leadId, sig, rest] = token.split('.');
  if (rest !== undefined || !leadId || !sig || !/^lead_[A-Za-z0-9]{10,60}$/.test(leadId)) return null;
  const expected = sign(leadId);
  if (!expected || sig.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? leadId : null;
}

export function briefLink(leadId: string, basis = 'https://felix-zoepp-website.vercel.app/brief'): string {
  return `${basis}?l=${encodeURIComponent(briefToken(leadId))}`;
}

/* ── Anfrage (Fragen am Ende) ──────────────────────────────────── */

const s = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export interface BriefAnfrage {
  name: string;
  firma: string;
  telefon: string;
  branche: string[];
  rolle: string;
  team: string;
  ziel: string;
  utm: FunnelLead['utm'];
}

/** Body der Seite prüfen (rein, testbar) – null = unvollständig */
export function leseBriefAnfrage(body: Record<string, unknown>): BriefAnfrage | null {
  const name = s(body.name, 80);
  const firma = s(body.firma, 120);
  const telefon = s(body.tel, 40);
  if (!name || !firma || telefon.replace(/\D/g, '').length < 6) return null;
  const branche = Array.isArray(body.branche) ? body.branche.map((b) => s(b, 60)).filter(Boolean).slice(0, 6) : [];
  const utm = (body.utm && typeof body.utm === 'object' ? body.utm : {}) as Record<string, unknown>;
  const u = (k: string) => s(utm[k], 120) || null;
  return {
    name,
    firma,
    telefon,
    branche,
    rolle: s(body.rolle, 60),
    team: s(body.team, 40),
    ziel: s(body.ziel, 40),
    utm: { source: u('source'), medium: u('medium'), campaign: u('campaign'), content: u('content'), term: u('term') },
  };
}

/** Anfrage → Funnel-Lead (Antworten landen als Notiz + passende Close-Felder) */
export function briefAlsFunnelLead(a: BriefAnfrage): FunnelLead {
  const antworten = [
    { frage: 'Firma', antwort: a.firma },
    { frage: 'Branche', antwort: a.branche.join(', ') },
    { frage: 'Rolle', antwort: a.rolle },
    { frage: 'Teamgröße', antwort: a.team },
    { frage: 'Einstellungen pro Monat', antwort: a.ziel },
  ].filter((x) => x.antwort);
  return { name: a.name, email: null, phone: a.telefon, funnelName: BRIEF_FUNNEL, utm: a.utm, antworten };
}

/** Calendly (Setting) mit Name und Herkunft vorausgefüllt */
export function briefCalendlyUrl(name: string, utmSource = 'brief'): string {
  const url = new URL(BOOKING_URLS.setting);
  url.searchParams.set('name', name);
  url.searchParams.set('utm_source', utmSource);
  url.searchParams.set('utm_campaign', 'brief-vertriebsleiter');
  return url.toString();
}

/* ── Zähler ────────────────────────────────────────────────────── */

export async function briefZaehler(svc: SupabaseClient): Promise<{ geoeffnet: number; ende: number }> {
  const zaehle = async (art: string) => {
    const { count } = await svc.from('sales_brief_events').select('id', { count: 'exact', head: true }).eq('art', art);
    return count ?? 0;
  };
  const [geoeffnet, ende] = await Promise.all([zaehle('offen'), zaehle('ende')]);
  return { geoeffnet, ende };
}
