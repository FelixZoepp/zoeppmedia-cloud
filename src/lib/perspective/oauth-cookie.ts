/** Kurzlebiger, httpOnly OAuth-Zwischenstand (state + PKCE-Verifier) für den Perspective-Flow. */
export const OAUTH_COOKIE = 'zmc_pv_oauth';
export const OAUTH_COOKIE_PFAD = '/api/perspective/oauth';

export interface OAuthZwischenstand {
  state: string;
  verifier: string;
  redirectUri: string;
  zurueck: string;
}

export function kodiereZwischenstand(z: OAuthZwischenstand): string {
  return Buffer.from(JSON.stringify(z), 'utf8').toString('base64url');
}

export function dekodiereZwischenstand(wert: string | undefined): OAuthZwischenstand | null {
  if (!wert) return null;
  try {
    const z = JSON.parse(Buffer.from(wert, 'base64url').toString('utf8')) as Partial<OAuthZwischenstand>;
    if (!z.state || !z.verifier || !z.redirectUri) return null;
    return { state: z.state, verifier: z.verifier, redirectUri: z.redirectUri, zurueck: z.zurueck || '/admin/anbindung' };
  } catch {
    return null;
  }
}

/** Code + state aus einer zurückkopierten Callback-URL (oder nur dem Query-Teil) lesen. */
export function codeAusUrl(eingabe: string): { code: string | null; state: string | null; fehler: string | null } {
  const t = eingabe.trim();
  let params: URLSearchParams;
  try {
    params = new URL(t).searchParams;
  } catch {
    params = new URLSearchParams(t.includes('?') ? t.slice(t.indexOf('?') + 1) : t);
  }
  return { code: params.get('code'), state: params.get('state'), fehler: params.get('error_description') || params.get('error') };
}
