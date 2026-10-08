/** Gemockter Graph-API-fetch: Antworten je „METHODE pfad“, alle Aufrufe werden mitgeschrieben. */

export interface MetaCall {
  method: string;
  path: string;
  params: Record<string, string>;
  body: Record<string, unknown> | null;
}

type Antwort = Record<string, unknown> | ((call: MetaCall) => Record<string, unknown>);

export function mockMetaFetch(routen: Record<string, Antwort>) {
  const calls: MetaCall[] = [];
  const fetchMock = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v\d+\.\d+/, '');
    const params = Object.fromEntries(url.searchParams.entries());
    delete params.access_token;
    const method = (init?.method ?? 'GET').toUpperCase();
    const call: MetaCall = { method, path, params, body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    const key = `${method} ${path}`;
    const antwort = routen[key] ?? Object.entries(routen).find(([k]) => k.endsWith('*') && key.startsWith(k.slice(0, -1)))?.[1];
    const data = typeof antwort === 'function' ? antwort(call) : antwort ?? { error: { message: `Unerwarteter Aufruf ${key}` } };
    return { ok: !('error' in data), json: async () => data } as Response;
  };
  return { fetchMock, calls };
}
