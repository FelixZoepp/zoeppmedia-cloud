import { describe, it, expect, vi } from 'vitest';
import { PerspectiveMcp, PerspectiveToolFehler, feld, leseRpcAntwort, toolInhalt } from '../mcp-client';

function antwort(body: string, headers: Record<string, string> = {}, status = 200) {
  return new Response(body, { status, headers });
}

describe('leseRpcAntwort', () => {
  it('liest JSON und SSE', () => {
    expect(leseRpcAntwort('{"jsonrpc":"2.0","id":2,"result":{"a":1}}', 'application/json', 2)?.result).toEqual({ a: 1 });
    const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"ok":true}}\n\n';
    expect(leseRpcAntwort(sse, 'text/event-stream', 3)?.result).toEqual({ ok: true });
  });
});

describe('toolInhalt', () => {
  it('bevorzugt structuredContent, sonst JSON-Text, wirft bei isError', () => {
    expect(toolInhalt('x', { structuredContent: { data: { id: 'a' } } })).toEqual({ data: { id: 'a' } });
    expect(toolInhalt('x', { content: [{ type: 'text', text: '{"data":{"jobId":"j1"}}' }] })).toEqual({ data: { jobId: 'j1' } });
    expect(() => toolInhalt('x', { isError: true, content: [{ type: 'text', text: 'Funnel not found' }] })).toThrow(PerspectiveToolFehler);
  });
  it('feld findet Werte oben, in data und in funnel', () => {
    expect(feld({ data: { jobId: 'j' } }, 'jobId')).toBe('j');
    expect(feld({ funnel: { id: 'f' } }, 'id')).toBe('f');
    expect(feld({ liveUrl: 'u' }, 'liveUrl')).toBe('u');
  });
});

describe('PerspectiveMcp', () => {
  it('initialisiert einmal, sendet API-Key und Session-ID, ruft Tools auf', async () => {
    const aufrufe: Array<{ body: { method: string; id?: number }; headers: Record<string, string> }> = [];
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      aufrufe.push({ body, headers: init.headers as Record<string, string> });
      if (body.method === 'initialize') return antwort(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {} }), { 'content-type': 'application/json', 'mcp-session-id': 's1' });
      if (body.method === 'notifications/initialized') return antwort('', {}, 202);
      return antwort(`data: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: '{"data":{"id":"abc"}}' }] } })}\n\n`, { 'content-type': 'text/event-stream' });
    });
    const mcp = new PerspectiveMcp('key-1', 'https://x/mcp', fetchFn as unknown as typeof fetch);
    expect(await mcp.tool('duplicate_funnel', { funnelId: 'v' })).toEqual({ data: { id: 'abc' } });
    await mcp.tool('publish_funnel', { funnelId: 'abc' });
    expect(aufrufe.map((a) => a.body.method)).toEqual(['initialize', 'notifications/initialized', 'tools/call', 'tools/call']);
    expect(aufrufe[0].headers['x-perspective-api-key']).toBe('key-1');
    expect(aufrufe[2].headers['mcp-session-id']).toBe('s1');
  });

  it('meldet HTTP- und JSON-RPC-Fehler', async () => {
    const fetchFn = vi.fn(async () => antwort('unauthorized', {}, 401));
    const mcp = new PerspectiveMcp('k', 'https://x/mcp', fetchFn as unknown as typeof fetch);
    await expect(mcp.tool('list_funnels', {})).rejects.toThrow(/HTTP 401/);
  });

  it('ausEnv ohne Key wirft', () => {
    const alt = process.env.PERSPECTIVE_API_KEY;
    delete process.env.PERSPECTIVE_API_KEY;
    expect(() => PerspectiveMcp.ausEnv()).toThrow(/PERSPECTIVE_API_KEY/);
    if (alt) process.env.PERSPECTIVE_API_KEY = alt;
  });
});
