/**
 * Perspective per OAuth 2.1 (PKCE S256, öffentlicher Client ohne Secret).
 *
 * Der Remote-MCP-Server akzeptiert nur `Authorization: Bearer <token>` (Auth0, RS256) – einen
 * API-Key gibt es für uns nicht. Metadaten (https://api.perspective.co/.well-known/oauth-authorization-server):
 * authorize/token/register unter https://api.perspective.co/oauth/*, Grants authorization_code + refresh_token,
 * token_endpoint_auth_method "none", Scopes openid + offline_access (→ Refresh-Token).
 * Doku: https://developers.perspective.co/oauth/overview, https://developers.perspective.co/oauth/endpoints
 *
 * Eine Verbindung für die ganze Cloud (Tabelle perspective_verbindung, id = 1), Tokens verschlüsselt.
 */
import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, encryptSecret } from '@/lib/crypto';

const BASIS = process.env.PERSPECTIVE_OAUTH_BASE || 'https://api.perspective.co';
export const PERSPECTIVE_OAUTH = {
  authorize: `${BASIS}/oauth/authorize`,
  token: `${BASIS}/oauth/token`,
  register: `${BASIS}/oauth/register`,
  scope: 'openid offline_access',
};

/**
 * Fallback, falls Perspective/Auth0 unsere Domain nicht als Callback akzeptiert: Localhost-Callbacks
 * nutzen auch MCP-Clients wie Claude Code. Die Seite lädt dann nicht – der Admin kopiert die URL zurück.
 */
export const MANUELL_REDIRECT = 'http://localhost:33418/callback';

export function cloudRedirectUri(): string {
  const basis = (process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de').replace(/\/$/, '');
  return `${basis}/api/perspective/oauth/callback`;
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function challengeFuer(verifier: string): string {
  return b64url(createHash('sha256').update(verifier).digest());
}

export function pkcePaar(): { verifier: string; challenge: string; state: string } {
  const verifier = b64url(randomBytes(48));
  return { verifier, challenge: challengeFuer(verifier), state: b64url(randomBytes(24)) };
}

export class PerspectiveOAuthFehler extends Error {
  constructor(message: string, public endgueltig = false) {
    super(message);
    this.name = 'PerspectiveOAuthFehler';
  }
}

interface VerbindungZeile {
  id: number;
  client_id: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  expires_at: string | null;
  status: 'getrennt' | 'verbunden' | 'abgelaufen';
  fehler: string | null;
  company_id: string | null;
  subscription_id: string | null;
  verbunden_am: string | null;
  lock_bis: string | null;
}

async function ladeZeile(svc: SupabaseClient): Promise<VerbindungZeile | null> {
  const { data } = await svc.from('perspective_verbindung').select('*').eq('id', 1).maybeSingle();
  return (data as VerbindungZeile | null) ?? null;
}

async function schreibe(svc: SupabaseClient, patch: Partial<VerbindungZeile> & Record<string, unknown>) {
  const { data } = await svc
    .from('perspective_verbindung')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('id');
  if (!(data as unknown[] | null)?.length) {
    await svc.from('perspective_verbindung').insert({ id: 1, ...patch, updated_at: new Date().toISOString() });
  }
}

/** client_id per Dynamic Client Registration holen (Perspective vergibt eine gemeinsame ID) und merken. */
export async function clientIdHolen(svc: SupabaseClient, fetchFn: typeof fetch = fetch): Promise<string> {
  const zeile = await ladeZeile(svc);
  if (zeile?.client_id) return zeile.client_id;
  const res = await fetchFn(PERSPECTIVE_OAUTH.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Zoepp Media Cloud',
      redirect_uris: [cloudRedirectUri(), MANUELL_REDIRECT],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { client_id?: string; error?: string };
  if (!res.ok || !j.client_id) throw new PerspectiveOAuthFehler(`Registrierung fehlgeschlagen: ${j.error ?? `HTTP ${res.status}`}`);
  await schreibe(svc, { client_id: j.client_id });
  return j.client_id;
}

export function authorizeUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: PERSPECTIVE_OAUTH.scope,
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
  });
  return `${PERSPECTIVE_OAUTH.authorize}?${q.toString()}`;
}

/** Claims eines JWT ohne Prüfung lesen (nur zur Anzeige – geprüft wird das Token von Perspective). */
export function tokenClaims(jwt: string): { companyId: string | null; subscriptionId: string | null; exp: number | null } {
  try {
    const teil = jwt.split('.')[1];
    if (!teil) return { companyId: null, subscriptionId: null, exp: null };
    const claims = JSON.parse(Buffer.from(teil.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as Record<string, unknown>;
    const meta = (claims['https://perspective.co/user_metadata'] ?? {}) as Record<string, unknown>;
    return {
      companyId: typeof meta.companyId === 'string' ? meta.companyId : null,
      subscriptionId: typeof meta.subscriptionId === 'string' ? meta.subscriptionId : null,
      exp: typeof claims.exp === 'number' ? claims.exp : null,
    };
  } catch {
    return { companyId: null, subscriptionId: null, exp: null };
  }
}

interface TokenAntwort {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenAnfrage(fetchFn: typeof fetch, felder: Record<string, string>): Promise<TokenAntwort> {
  const res = await fetchFn(PERSPECTIVE_OAUTH.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(felder).toString(),
  });
  const j = (await res.json().catch(() => ({}))) as TokenAntwort;
  if (!res.ok || !j.access_token) {
    const grund = j.error_description || j.error || `HTTP ${res.status}`;
    // 400/401 (invalid_grant usw.) = Verbindung kaputt; 5xx/Netz = später nochmal
    throw new PerspectiveOAuthFehler(grund, res.status >= 400 && res.status < 500);
  }
  return j;
}

function ablaufAus(j: TokenAntwort, now: Date): string {
  const exp = j.access_token ? tokenClaims(j.access_token).exp : null;
  const sek = j.expires_in ?? (exp ? exp - Math.floor(now.getTime() / 1000) : 3600);
  return new Date(now.getTime() + Math.max(60, sek) * 1000).toISOString();
}

/** Autorisierungscode gegen Tokens tauschen und verschlüsselt speichern. */
export async function tauscheCode(
  svc: SupabaseClient,
  p: { code: string; verifier: string; redirectUri: string; userId: string | null },
  opts: { fetchFn?: typeof fetch; now?: Date } = {},
): Promise<{ companyId: string | null }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const now = opts.now ?? new Date();
  const clientId = await clientIdHolen(svc, fetchFn);
  const j = await tokenAnfrage(fetchFn, {
    grant_type: 'authorization_code',
    client_id: clientId,
    code: p.code,
    code_verifier: p.verifier,
    redirect_uri: p.redirectUri,
  });
  const claims = tokenClaims(j.access_token!);
  await schreibe(svc, {
    access_token_enc: encryptSecret(j.access_token!),
    refresh_token_enc: j.refresh_token ? encryptSecret(j.refresh_token) : null,
    expires_at: ablaufAus(j, now),
    status: 'verbunden',
    fehler: null,
    company_id: claims.companyId,
    subscription_id: claims.subscriptionId,
    verbunden_am: now.toISOString(),
    verbunden_von: p.userId,
    lock_bis: new Date(0).toISOString(),
  });
  return { companyId: claims.companyId };
}

/** Verbindung als abgelaufen markieren – Benachrichtigung nur beim Wechsel (einmal). */
async function markiereAbgelaufen(svc: SupabaseClient, grund: string) {
  const { data } = await svc
    .from('perspective_verbindung')
    .update({ status: 'abgelaufen', fehler: grund.slice(0, 300), lock_bis: new Date(0).toISOString(), updated_at: new Date().toISOString() })
    .eq('id', 1)
    .eq('status', 'verbunden')
    .select('id');
  if ((data as unknown[] | null)?.length) {
    const { createNotificationForInternals } = await import('@/lib/notifications/create');
    await createNotificationForInternals(svc, {
      title: 'Perspective-Verbindung abgelaufen',
      body: 'Bitte unter Admin → Anbindung „Perspective verbinden“ neu ausführen – bis dahin baut die Cloud keine Funnels.',
      type: 'system',
      push_url: '/admin/anbindung',
    }).catch(() => undefined);
  }
}

const VORLAUF_MS = 60_000;

/**
 * Gültiges Access-Token liefern (bei Bedarf per Refresh-Token erneuern) oder null, wenn nicht verbunden.
 * Parallele Läufe: Nur wer die Sperre (lock_bis) bekommt, erneuert; die anderen warten und lesen nach.
 */
export async function holeAccessToken(
  svc: SupabaseClient,
  opts: { fetchFn?: typeof fetch; now?: () => Date; warten?: (ms: number) => Promise<void> } = {},
): Promise<string | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  const jetzt = opts.now ?? (() => new Date());
  const warten = opts.warten ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let versuch = 0; versuch < 4; versuch++) {
    const z = await ladeZeile(svc);
    if (!z || z.status !== 'verbunden' || !z.access_token_enc) return null;
    const now = jetzt();
    if (z.expires_at && new Date(z.expires_at).getTime() - now.getTime() > VORLAUF_MS) {
      return decryptSecret(z.access_token_enc);
    }
    if (!z.refresh_token_enc || !z.client_id) {
      await markiereAbgelaufen(svc, 'Kein Refresh-Token vorhanden');
      return null;
    }

    const { data: sperre } = await svc
      .from('perspective_verbindung')
      .update({ lock_bis: new Date(now.getTime() + 30_000).toISOString() })
      .eq('id', 1)
      .lt('lock_bis', now.toISOString())
      .select('id');
    if (!(sperre as unknown[] | null)?.length) {
      await warten(1500);
      continue;
    }

    try {
      const j = await tokenAnfrage(fetchFn, {
        grant_type: 'refresh_token',
        client_id: z.client_id,
        refresh_token: decryptSecret(z.refresh_token_enc),
      });
      await schreibe(svc, {
        access_token_enc: encryptSecret(j.access_token!),
        // Auth0 rotiert ggf. – neues Refresh-Token übernehmen, sonst das alte behalten
        ...(j.refresh_token ? { refresh_token_enc: encryptSecret(j.refresh_token) } : {}),
        expires_at: ablaufAus(j, now),
        fehler: null,
        lock_bis: new Date(0).toISOString(),
      });
      return j.access_token!;
    } catch (err) {
      if (err instanceof PerspectiveOAuthFehler && err.endgueltig) {
        await markiereAbgelaufen(svc, err.message);
        return null;
      }
      await schreibe(svc, { lock_bis: new Date(0).toISOString() });
      throw err;
    }
  }
  throw new PerspectiveOAuthFehler('Token-Erneuerung läuft parallel – später erneut versuchen');
}

export interface VerbindungsStatus {
  verbunden: boolean;
  status: 'getrennt' | 'verbunden' | 'abgelaufen' | 'api_key';
  seit: string | null;
  companyId: string | null;
  fehler: string | null;
}

export async function verbindungsStatus(svc: SupabaseClient): Promise<VerbindungsStatus> {
  const z = await ladeZeile(svc).catch(() => null);
  if (z?.status === 'verbunden' && z.access_token_enc) {
    return { verbunden: true, status: 'verbunden', seit: z.verbunden_am, companyId: z.company_id, fehler: null };
  }
  if (process.env.PERSPECTIVE_API_KEY) return { verbunden: true, status: 'api_key', seit: null, companyId: null, fehler: null };
  return { verbunden: false, status: z?.status ?? 'getrennt', seit: z?.verbunden_am ?? null, companyId: z?.company_id ?? null, fehler: z?.fehler ?? null };
}

/** Gemeinsame Prüfung „kann die Cloud mit Perspective sprechen?“ (OAuth verbunden oder API-Key gesetzt). */
export async function istPerspectiveVerbunden(svc: SupabaseClient): Promise<boolean> {
  return (await verbindungsStatus(svc)).verbunden;
}

export async function trennen(svc: SupabaseClient) {
  await schreibe(svc, {
    access_token_enc: null,
    refresh_token_enc: null,
    expires_at: null,
    status: 'getrennt',
    fehler: null,
    company_id: null,
    subscription_id: null,
    verbunden_am: null,
    lock_bis: new Date(0).toISOString(),
  });
}
