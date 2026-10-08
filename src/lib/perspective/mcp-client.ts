/**
 * Minimaler Client für den Perspective-Product-MCP-Server (Streamable HTTP, JSON-RPC 2.0).
 *
 * Die REST-API von Perspective kennt nur Workspaces, Kontakte und Kennzahlen – Funnels anlegen,
 * duplizieren, per KI bearbeiten und veröffentlichen geht nur über die MCP-Tools
 * (https://developers.perspective.co/mcp/overview). Der gehostete Server akzeptiert OAuth-Bearer-Tokens
 * (Verbindung per „Perspective verbinden“, siehe oauth.ts); falls doch ein API-Key gesetzt ist, geht er
 * wie bei der Desktop-Erweiterung im Header `x-perspective-api-key` mit
 * (https://developers.perspective.co/mcp/authentication).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { holeAccessToken } from './oauth';

const PROTOCOL_VERSION = '2025-06-18';

export class PerspectiveNichtKonfiguriert extends Error {
  constructor() {
    super('Perspective ist nicht verbunden – unter Admin → Anbindung „Perspective verbinden“');
    this.name = 'PerspectiveNichtKonfiguriert';
  }
}

export class PerspectiveToolFehler extends Error {
  constructor(public tool: string, message: string) {
    super(`Perspective ${tool}: ${message}`);
    this.name = 'PerspectiveToolFehler';
  }
}

type JsonRpcAntwort = { jsonrpc: '2.0'; id?: number | string; result?: unknown; error?: { code: number; message: string } };

/** Antwort als JSON oder als Server-Sent-Events (`data: {...}`) lesen und die Nachricht mit passender id liefern. */
export function leseRpcAntwort(text: string, contentType: string | null, id: number): JsonRpcAntwort | null {
  const kandidaten: JsonRpcAntwort[] = [];
  if (contentType?.includes('text/event-stream')) {
    // Ereignisse sind durch Leerzeilen getrennt, mehrere data:-Zeilen gehören zusammen
    for (const block of text.split(/\r?\n\r?\n/)) {
      const daten = block
        .split(/\r?\n/)
        .filter((z) => z.startsWith('data:'))
        .map((z) => z.slice(5).trimStart())
        .join('\n');
      if (!daten) continue;
      try { kandidaten.push(JSON.parse(daten)); } catch { /* Keep-alive o. ä. */ }
    }
  } else if (text.trim()) {
    const geparst = JSON.parse(text) as JsonRpcAntwort | JsonRpcAntwort[];
    kandidaten.push(...(Array.isArray(geparst) ? geparst : [geparst]));
  }
  return kandidaten.find((k) => k.id === id) ?? null;
}

/** Tool-Ergebnis in ein Objekt verwandeln: structuredContent bevorzugt, sonst JSON im ersten Text-Block. */
export function toolInhalt(tool: string, result: unknown): Record<string, unknown> {
  const r = (result ?? {}) as { isError?: boolean; structuredContent?: unknown; content?: Array<{ type: string; text?: string }> };
  const text = (r.content ?? []).filter((c) => c.type === 'text' && c.text).map((c) => c.text).join('\n');
  if (r.isError) throw new PerspectiveToolFehler(tool, text || 'unbekannter Fehler');
  if (r.structuredContent && typeof r.structuredContent === 'object') return r.structuredContent as Record<string, unknown>;
  if (!text) return {};
  try {
    const obj = JSON.parse(text);
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : { wert: obj };
  } catch {
    return { text };
  }
}

export type PerspectiveAuth = { typ: 'bearer'; token: string } | { typ: 'key'; key: string };

export class PerspectiveMcp {
  private sessionId: string | null = null;
  private initialisiert = false;
  private naechsteId = 1;

  private auth: PerspectiveAuth;

  constructor(
    auth: PerspectiveAuth | string,
    private url: string = process.env.PERSPECTIVE_MCP_URL || 'https://api.perspective.co/mcp',
    private fetchFn: typeof fetch = fetch,
  ) {
    this.auth = typeof auth === 'string' ? { typ: 'key', key: auth } : auth;
  }

  /** OAuth-Verbindung bevorzugt, sonst PERSPECTIVE_API_KEY; ohne beides PerspectiveNichtKonfiguriert. */
  static async ausVerbindung(svc: SupabaseClient, fetchFn: typeof fetch = fetch): Promise<PerspectiveMcp> {
    const token = await holeAccessToken(svc, { fetchFn });
    if (token) return new PerspectiveMcp({ typ: 'bearer', token }, undefined, fetchFn);
    const key = process.env.PERSPECTIVE_API_KEY;
    if (key) return new PerspectiveMcp({ typ: 'key', key }, undefined, fetchFn);
    throw new PerspectiveNichtKonfiguriert();
  }

  private async senden(method: string, params?: unknown, benachrichtigung = false): Promise<unknown> {
    const id = this.naechsteId++;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL_VERSION,
    };
    if (this.auth.typ === 'bearer') headers.authorization = `Bearer ${this.auth.token}`;
    else headers['x-perspective-api-key'] = this.auth.key;
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    const body = benachrichtigung ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params };

    const res = await this.fetchFn(this.url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'manual' });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (benachrichtigung) return null;
    const text = await res.text();
    if (!res.ok) throw new PerspectiveToolFehler(method, `HTTP ${res.status} ${text.slice(0, 300)}`);
    const antwort = leseRpcAntwort(text, res.headers.get('content-type'), id);
    if (!antwort) throw new PerspectiveToolFehler(method, 'keine Antwort vom Server');
    if (antwort.error) throw new PerspectiveToolFehler(method, antwort.error.message);
    return antwort.result;
  }

  private async init(): Promise<void> {
    if (this.initialisiert) return;
    await this.senden('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'zoepp-media-cloud', version: '1.0.0' },
    });
    await this.senden('notifications/initialized', undefined, true);
    this.initialisiert = true;
  }

  async tool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.init();
    const result = await this.senden('tools/call', { name, arguments: args });
    return toolInhalt(name, result);
  }
}

/** Wert aus `obj` oder `obj.data` lesen (die Tools liefern teils `{ data: {...} }`). */
export function feld(obj: Record<string, unknown>, ...namen: string[]): string | null {
  const ebenen = [obj, (obj.data ?? null) as Record<string, unknown> | null, (obj.funnel ?? null) as Record<string, unknown> | null];
  for (const e of ebenen) {
    if (!e || typeof e !== 'object') continue;
    for (const n of namen) {
      const v = e[n];
      if (typeof v === 'string' && v) return v;
    }
  }
  return null;
}
