import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';

const benachrichtigt = vi.fn(async () => undefined);
vi.mock('@/lib/notifications/create', () => ({ createNotificationForInternals: (...a: unknown[]) => benachrichtigt(...(a as [])) }));

import { decryptSecret, encryptSecret } from '@/lib/crypto';
import {
  authorizeUrl,
  challengeFuer,
  clientIdHolen,
  holeAccessToken,
  istPerspectiveVerbunden,
  pkcePaar,
  tauscheCode,
  tokenClaims,
  trennen,
} from '../oauth';
import { codeAusUrl, dekodiereZwischenstand, kodiereZwischenstand } from '../oauth-cookie';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
});
beforeEach(() => {
  benachrichtigt.mockClear();
  delete process.env.PERSPECTIVE_API_KEY;
});

const EPOCH = new Date(0).toISOString();

function jwt(claims: Record<string, unknown>) {
  const teil = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${teil({ alg: 'RS256' })}.${teil(claims)}.sig`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function zeile(extra: Record<string, unknown> = {}) {
  return { id: 1, client_id: 'cid', status: 'getrennt', lock_bis: EPOCH, ...extra };
}

describe('PKCE, state, Cookie', () => {
  it('Challenge ist S256 (RFC 7636 Beispiel) und Paare sind zufällig', () => {
    expect(challengeFuer('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    const a = pkcePaar();
    const b = pkcePaar();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.state).not.toBe(b.state);
    expect(a.challenge).toBe(challengeFuer(a.verifier));
  });

  it('authorizeUrl enthält PKCE, Scope und state', () => {
    const u = new URL(authorizeUrl({ clientId: 'cid', redirectUri: 'https://c/cb', state: 's1', challenge: 'ch' }));
    expect(u.origin + u.pathname).toBe('https://api.perspective.co/oauth/authorize');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: 'cid',
      redirect_uri: 'https://c/cb',
      state: 's1',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      scope: 'openid offline_access',
    });
  });

  it('Zwischenstand-Cookie hin und zurück, kaputtes Cookie = null', () => {
    const z = { state: 's', verifier: 'v', redirectUri: 'r', zurueck: '/admin/anbindung' };
    expect(dekodiereZwischenstand(kodiereZwischenstand(z))).toEqual(z);
    expect(dekodiereZwischenstand('quatsch')).toBeNull();
    expect(dekodiereZwischenstand(undefined)).toBeNull();
  });

  it('codeAusUrl liest Code und state aus der zurückkopierten Adresse', () => {
    expect(codeAusUrl('http://localhost:33418/callback?code=abc&state=s1')).toEqual({ code: 'abc', state: 's1', fehler: null });
    expect(codeAusUrl('?error=access_denied&error_description=Nein').fehler).toBe('Nein');
  });
});

describe('Registrierung und Token-Tausch', () => {
  it('registriert einmal und merkt sich die client_id', async () => {
    const { client, tables } = createFakeDb({ perspective_verbindung: [{ id: 1, status: 'getrennt', lock_bis: EPOCH }] });
    const fetchFn = vi.fn(async () => json({ client_id: 'shared-id' }, 201));
    expect(await clientIdHolen(client, fetchFn as unknown as typeof fetch)).toBe('shared-id');
    expect(await clientIdHolen(client, fetchFn as unknown as typeof fetch)).toBe('shared-id');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(tables.perspective_verbindung[0].client_id).toBe('shared-id');
  });

  it('tauscht Code mit Verifier, speichert verschlüsselt und liest Workspace aus dem Token', async () => {
    const { client, tables } = createFakeDb({ perspective_verbindung: [zeile()] });
    const access = jwt({ exp: 2_000_000_000, 'https://perspective.co/user_metadata': { companyId: 'comp1', subscriptionId: 'sub1' } });
    let gesendet = '';
    const fetchFn = vi.fn(async (_u: string, init: RequestInit) => {
      gesendet = String(init.body);
      return json({ access_token: access, refresh_token: 'r1', expires_in: 3600 });
    });
    const now = new Date('2026-10-08T12:00:00Z');
    const r = await tauscheCode(client, { code: 'c1', verifier: 'ver', redirectUri: 'https://c/cb', userId: 'u1' }, { fetchFn: fetchFn as unknown as typeof fetch, now });
    expect(r.companyId).toBe('comp1');
    const p = new URLSearchParams(gesendet);
    expect(Object.fromEntries(p)).toMatchObject({ grant_type: 'authorization_code', client_id: 'cid', code: 'c1', code_verifier: 'ver', redirect_uri: 'https://c/cb' });
    const z = tables.perspective_verbindung[0];
    expect(z.status).toBe('verbunden');
    expect(z.access_token_enc).not.toContain(access.slice(0, 20));
    expect(decryptSecret(z.access_token_enc as string)).toBe(access);
    expect(decryptSecret(z.refresh_token_enc as string)).toBe('r1');
    expect(z.expires_at).toBe('2026-10-08T13:00:00.000Z');
    expect(z.company_id).toBe('comp1');
    expect(await istPerspectiveVerbunden(client)).toBe(true);
  });

  it('Fehler beim Tausch wirft und verbindet nicht', async () => {
    const { client, tables } = createFakeDb({ perspective_verbindung: [zeile()] });
    const fetchFn = vi.fn(async () => json({ error: 'invalid_grant', error_description: 'Invalid authorization code' }, 403));
    await expect(
      tauscheCode(client, { code: 'x', verifier: 'v', redirectUri: 'r', userId: null }, { fetchFn: fetchFn as unknown as typeof fetch }),
    ).rejects.toThrow(/Invalid authorization code/);
    expect(tables.perspective_verbindung[0].status).toBe('getrennt');
  });
});

describe('holeAccessToken', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const opts = (fetchFn: unknown) => ({ fetchFn: fetchFn as typeof fetch, now: () => now, warten: async () => undefined });

  it('liefert gültiges Token ohne Netzaufruf, null wenn nicht verbunden', async () => {
    const { client } = createFakeDb({
      perspective_verbindung: [zeile({ status: 'verbunden', access_token_enc: encryptSecret('a1'), refresh_token_enc: encryptSecret('r1'), expires_at: '2026-10-08T13:00:00Z' })],
    });
    const fetchFn = vi.fn();
    expect(await holeAccessToken(client, opts(fetchFn))).toBe('a1');
    expect(fetchFn).not.toHaveBeenCalled();
    const leer = createFakeDb({ perspective_verbindung: [zeile()] });
    expect(await holeAccessToken(leer.client, opts(fetchFn))).toBeNull();
  });

  it('erneuert abgelaufenes Token per Refresh, übernimmt rotiertes Refresh-Token und gibt die Sperre frei', async () => {
    const { client, tables } = createFakeDb({
      perspective_verbindung: [zeile({ status: 'verbunden', access_token_enc: encryptSecret('alt'), refresh_token_enc: encryptSecret('r1'), expires_at: '2026-10-08T12:00:30Z' })],
    });
    let gesendet = '';
    const fetchFn = vi.fn(async (_u: string, init: RequestInit) => {
      gesendet = String(init.body);
      return json({ access_token: 'neu', refresh_token: 'r2', expires_in: 3600 });
    });
    expect(await holeAccessToken(client, opts(fetchFn))).toBe('neu');
    expect(Object.fromEntries(new URLSearchParams(gesendet))).toMatchObject({ grant_type: 'refresh_token', client_id: 'cid', refresh_token: 'r1' });
    const z = tables.perspective_verbindung[0];
    expect(decryptSecret(z.refresh_token_enc as string)).toBe('r2');
    expect(z.lock_bis).toBe(EPOCH);
    expect(z.expires_at).toBe('2026-10-08T13:00:00.000Z');
  });

  it('wartet, wenn ein anderer Lauf gerade erneuert, und nutzt dessen Token', async () => {
    const { client, tables } = createFakeDb({
      perspective_verbindung: [
        zeile({ status: 'verbunden', access_token_enc: encryptSecret('alt'), refresh_token_enc: encryptSecret('r1'), expires_at: '2026-10-08T11:00:00Z', lock_bis: '2026-10-08T12:00:20Z' }),
      ],
    });
    const fetchFn = vi.fn();
    const warten = vi.fn(async () => {
      // der andere Lauf ist fertig geworden
      Object.assign(tables.perspective_verbindung[0], { access_token_enc: encryptSecret('vom-anderen'), expires_at: '2026-10-08T13:00:00Z', lock_bis: EPOCH });
    });
    expect(await holeAccessToken(client, { fetchFn: fetchFn as unknown as typeof fetch, now: () => now, warten })).toBe('vom-anderen');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(warten).toHaveBeenCalledTimes(1);
  });

  it('abgelehntes Refresh-Token → Status abgelaufen, Benachrichtigung genau einmal', async () => {
    const { client, tables } = createFakeDb({
      perspective_verbindung: [zeile({ status: 'verbunden', access_token_enc: encryptSecret('alt'), refresh_token_enc: encryptSecret('r1'), expires_at: '2026-10-08T11:00:00Z' })],
    });
    const fetchFn = vi.fn(async () => json({ error: 'invalid_grant', error_description: 'Unknown or invalid refresh token.' }, 403));
    expect(await holeAccessToken(client, opts(fetchFn))).toBeNull();
    expect(tables.perspective_verbindung[0].status).toBe('abgelaufen');
    expect(tables.perspective_verbindung[0].fehler).toMatch(/invalid refresh token/);
    expect(await holeAccessToken(client, opts(fetchFn))).toBeNull();
    expect(benachrichtigt).toHaveBeenCalledTimes(1);
    expect(await istPerspectiveVerbunden(client)).toBe(false);
  });

  it('Serverfehler beim Refresh: wirft, bleibt verbunden, Sperre frei', async () => {
    const { client, tables } = createFakeDb({
      perspective_verbindung: [zeile({ status: 'verbunden', access_token_enc: encryptSecret('alt'), refresh_token_enc: encryptSecret('r1'), expires_at: '2026-10-08T11:00:00Z' })],
    });
    const fetchFn = vi.fn(async () => json({ error: 'server_error' }, 503));
    await expect(holeAccessToken(client, opts(fetchFn))).rejects.toThrow(/server_error/);
    expect(tables.perspective_verbindung[0].status).toBe('verbunden');
    expect(tables.perspective_verbindung[0].lock_bis).toBe(EPOCH);
  });
});

describe('Status', () => {
  it('trennen löscht Tokens; API-Key gilt weiter als verbunden', async () => {
    const { client, tables } = createFakeDb({
      perspective_verbindung: [zeile({ status: 'verbunden', access_token_enc: encryptSecret('a'), refresh_token_enc: encryptSecret('r'), expires_at: '2026-10-08T13:00:00Z' })],
    });
    await trennen(client);
    expect(tables.perspective_verbindung[0]).toMatchObject({ status: 'getrennt', access_token_enc: null, refresh_token_enc: null });
    expect(await istPerspectiveVerbunden(client)).toBe(false);
    process.env.PERSPECTIVE_API_KEY = 'k';
    expect(await istPerspectiveVerbunden(client)).toBe(true);
  });

  it('tokenClaims ist robust bei Nicht-JWTs', () => {
    expect(tokenClaims('kein.jwt')).toEqual({ companyId: null, subscriptionId: null, exp: null });
  });
});
