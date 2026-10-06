/**
 * 12 Persona-Typen (12personatypen.de): Ergebnisse aus API/Webhook in unsere Bewerber-Felder übersetzen.
 * Rein (keine I/O) – damit testbar.
 */
import { createHmac, timingSafeEqual } from 'crypto';

export const PERSONA_API = 'https://12personatypen.de/api/v1';

export interface PersonaDimension {
  key: string;
  name: string;
  score: number;
}

export interface PersonaErgebnis {
  persona_status: 'eingeladen' | 'begonnen' | 'abgeschlossen';
  persona_typ: string | null;
  persona_typ_key: string | null;
  persona_fit: string | null;
  persona_score: number | null;
  persona_warnungen: string[];
  persona_dimensionen: PersonaDimension[];
  persona_report_url: string | null;
  persona_abgeschlossen_am: string | null;
}

type Roh = Record<string, unknown>;
const obj = (v: unknown): Roh => (v && typeof v === 'object' ? (v as Roh) : {});
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

/** Warnungen kommen als Strings oder Objekte ({label|name|text}) */
function warnungen(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((w) => (typeof w === 'string' ? w : txt(obj(w).label) ?? txt(obj(w).name) ?? txt(obj(w).text) ?? txt(obj(w).key)))
    .filter((w): w is string => !!w)
    .slice(0, 10);
}

function dimensionen(v: unknown): PersonaDimension[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((d) => {
      const o = obj(d);
      const score = num(o.score);
      const name = txt(o.name) ?? txt(o.key);
      return name && score !== null ? { key: txt(o.key) ?? name, name, score } : null;
    })
    .filter((d): d is PersonaDimension => !!d)
    .slice(0, 20);
}

/** scores-Objekt (API: dimension_scores, Webhook: dimensionScores) → unsere Felder */
export function mappeScores(scoresRoh: unknown, reportUrl: unknown, abgeschlossenAm: unknown, status: unknown = 'abgeschlossen'): PersonaErgebnis {
  const s = obj(scoresRoh);
  const st = txt(status);
  return {
    persona_status: st === 'offen' ? 'eingeladen' : st === 'begonnen' ? 'begonnen' : 'abgeschlossen',
    persona_typ: txt(obj(s.archetype).name),
    persona_typ_key: txt(obj(s.archetype).key),
    persona_fit: txt(obj(s.fit).label) ?? txt(obj(s.fit).key),
    persona_score: num(s.overall),
    persona_warnungen: warnungen(s.warnings),
    persona_dimensionen: dimensionen(s.dimensionScores ?? s.dimension_scores),
    persona_report_url: txt(reportUrl),
    persona_abgeschlossen_am: txt(abgeschlossenAm),
  };
}

/** Webhook-Payload candidate.completed → externe ID (= unsere Bewerber-ID) + Ergebnis */
export function mappeWebhook(payload: unknown): { event: string | null; externeId: string | null; personaId: string | null; email: string | null; ergebnis: PersonaErgebnis } {
  const p = obj(payload);
  const data = obj(p.data);
  const cand = obj(data.candidate);
  return {
    event: txt(p.event),
    externeId: txt(cand.external_id),
    personaId: txt(cand.id),
    email: txt(cand.email)?.toLowerCase() ?? null,
    ergebnis: mappeScores(data.scores, data.reportUrl ?? data.report_url, p.timestamp ?? new Date().toISOString(), 'abgeschlossen'),
  };
}

/** API-Antwort GET /candidates/:id → Ergebnis (Status kann noch offen sein) */
export function mappeKandidat(roh: unknown): PersonaErgebnis {
  const c = obj(roh);
  const status = txt(c.status);
  const e = mappeScores(c.scores, c.report_url ?? c.reportUrl, c.completed_at, status ?? 'offen');
  return status === 'abgeschlossen' ? e : { ...e, persona_abgeschlossen_am: null };
}

/** X-SalesDNA-Signature: sha256=<hex HMAC-SHA256 des Roh-Bodys> */
export function pruefeSignatur(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const erwartet = 'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(header.trim());
  const b = Buffer.from(erwartet);
  return a.length === b.length && timingSafeEqual(a, b);
}
