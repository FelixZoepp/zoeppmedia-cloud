/**
 * Hiring Lisa (eigenständiges Produkt, eigenes Repo) – Schnittstelle aus Sicht der Cloud. Rein, testbar.
 * Lisa-API: ~/lisa-recruiting-ai/docs/API.md (Signatur wie Stripe: v1 = HMAC-SHA256(secret, "<t>.<roher Body>")).
 */

import { createHmac, timingSafeEqual } from 'crypto';

export const LISA_STANDARD_URL = 'https://lisa-recruiting-ai.vercel.app';

/** Signatur-Header `Lisa-Signature: t=…,v1=…` prüfen (max. 5 Minuten alt) */
export function pruefeLisaSignatur(secret: string, rawBody: string, header: string | null, jetztSek = Date.now() / 1000, toleranzSek = 300): boolean {
  if (!header || !secret) return false;
  const teile = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(teile.t);
  if (!Number.isFinite(t) || !teile.v1) return false;
  if (Math.abs(jetztSek - t) > toleranzSek) return false;
  const erwartet = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'));
  const erhalten = Buffer.from(teile.v1);
  return erwartet.length === erhalten.length && timingSafeEqual(erwartet, erhalten);
}

/** Signatur für eine Anfrage an Lisa (für Tests und optionale Signaturpflicht) */
export function signiere(secret: string, body: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

/** Quelle der Cloud → Lisa-`source` */
export function lisaQuelle(source: string | null | undefined): 'meta' | 'indeed' | 'partner' | 'website' | 'other' {
  const s = (source ?? '').toLowerCase();
  if (/meta|facebook|instagram|perspective|fb/.test(s)) return 'meta';
  if (s.includes('indeed')) return 'indeed';
  if (/partner|empfehlung/.test(s)) return 'partner';
  if (/form|website|apply|karriere|funnel/.test(s)) return 'website';
  return 'other';
}

export interface LisaAnruf {
  attempt_no?: number | null;
  outcome?: string | null; // reached, voicemail, busy, no_answer, failed, canceled, rejected
  result?: string | null; // termin, selbst_abgelehnt, rueckruf, keine_zeit, minderjaehrig, falsche_person, abgebrochen, do_not_call, kein_interesse, sprache, sonstiges
  summary?: string | null;
  answers?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  duration_sec?: number | null;
}

/** Lisa-Anruf → Ergebnis im Anruf-Protokoll der Cloud (call_logs.result) */
export function anrufErgebnis(call: LisaAnruf): 'termin_vereinbart' | 'rueckruf' | 'kein_interesse' | 'nicht_erreicht' | 'falsche_nummer' | 'sonstiges' {
  if (call.outcome && call.outcome !== 'reached') return 'nicht_erreicht';
  switch (call.result) {
    case 'termin':
      return 'termin_vereinbart';
    case 'rueckruf':
    case 'keine_zeit':
      return 'rueckruf';
    case 'selbst_abgelehnt':
    case 'kein_interesse':
    case 'do_not_call':
      return 'kein_interesse';
    case 'falsche_person':
      return 'falsche_nummer';
    default:
      return call.outcome === 'reached' ? 'sonstiges' : 'nicht_erreicht';
  }
}

const OUTCOME_TEXT: Record<string, string> = {
  reached: 'erreicht',
  voicemail: 'Mailbox',
  busy: 'besetzt',
  no_answer: 'nicht abgenommen',
  failed: 'Anruf fehlgeschlagen',
  canceled: 'abgebrochen',
  rejected: 'abgelehnt',
};

const RESULT_TEXT: Record<string, string> = {
  termin: 'Termin vereinbart',
  selbst_abgelehnt: 'hat selbst abgesagt',
  rueckruf: 'Rückruf gewünscht',
  keine_zeit: 'gerade keine Zeit',
  minderjaehrig: 'minderjährig',
  falsche_person: 'falsche Person',
  abgebrochen: 'Gespräch abgebrochen',
  do_not_call: 'möchte nicht mehr angerufen werden',
  kein_interesse: 'kein Interesse',
  sprache: 'Sprachproblem',
  sonstiges: 'Sonstiges',
};

function antwortZeilen(answers: LisaAnruf['answers']): string[] {
  if (!answers) return [];
  if (Array.isArray(answers)) {
    return answers
      .map((a) => {
        const frage = String(a.question ?? a.frage ?? a.key ?? '').trim();
        const antwort = a.answer ?? a.antwort ?? a.value;
        return frage && antwort != null && antwort !== '' ? `• ${frage}: ${String(antwort)}` : null;
      })
      .filter((z): z is string => !!z);
  }
  return Object.entries(answers)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `• ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
}

/** Notiz für das Anruf-Protokoll: Versuch, Ergebnis, Zusammenfassung, Antworten */
export function anrufNotiz(call: LisaAnruf): string {
  const kopf = [`🤖 Hiring Lisa`, call.attempt_no ? `Versuch ${call.attempt_no}` : null, OUTCOME_TEXT[call.outcome ?? ''] ?? call.outcome, call.result ? RESULT_TEXT[call.result] ?? call.result : null]
    .filter(Boolean)
    .join(' · ');
  const teile = [kopf];
  if (call.summary?.trim()) teile.push(call.summary.trim());
  const antworten = antwortZeilen(call.answers);
  if (antworten.length) teile.push(['Antworten:', ...antworten].join('\n'));
  return teile.join('\n\n').slice(0, 4000);
}

/** Lisa-Status → Phase in der Cloud (Stufen-Typ). null = Phase nicht ändern */
export function phaseFuerStatus(status: string | null | undefined): 'interview' | 'rejected' | null {
  switch (status) {
    case 'termin':
      return 'interview';
    case 'selbst_abgelehnt':
    case 'minderjaehrig':
      return 'rejected';
    default:
      return null;
  }
}

/** Absagegrund (Cloud-Code) für Lisa-Status, die zur Absage führen */
export function absageCodeFuerStatus(status: string | null | undefined): string | null {
  if (status === 'selbst_abgelehnt') return 'bewerber_abgesagt';
  if (status === 'minderjaehrig') return 'unter_18';
  return null;
}
