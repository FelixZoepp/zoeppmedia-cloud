import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Simuliertes Modell: Runde 1 ruft ein Werkzeug auf, Runde 2 antwortet mit Text
const streamCalls: Array<Record<string, unknown>> = [];
const scripted: Array<{ content: unknown[]; stop_reason: string; text?: string }> = [];

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}
  class RateLimitError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    beta = {
      messages: {
        stream: (params: Record<string, unknown>) => {
          streamCalls.push(JSON.parse(JSON.stringify(params)));
          const next = scripted.shift()!;
          let onText: ((d: string) => void) | null = null;
          return {
            on: (ev: string, fn: (d: string) => void) => {
              if (ev === 'text') onText = fn;
            },
            finalMessage: async () => {
              if (next.text && onText) onText(next.text);
              return { content: next.content, stop_reason: next.stop_reason };
            },
          };
        },
      },
    };
  }
  return { default: Anthropic };
});

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(async () => ({ id: 'u1', name: 'Felix Zoepp', email: 'f@z.de', role: 'employee', agency_id: null })),
  getEffectiveAgencyId: vi.fn(async () => null),
  isInternal: (r: string) => r === 'admin' || r === 'employee',
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
const runTool = vi.fn(async () => ({ offen: 3 }));
vi.mock('@/lib/assistant/tools', () => ({
  toolsFor: () => [{ label: 'Schaut in deine Aufgaben', tool: { name: 'meine_aufgaben', description: 'x', input_schema: { type: 'object', properties: {} } }, run: runTool }],
}));

import { POST } from '../route';

async function readEvents(res: Response) {
  const text = await res.text();
  return text.trim().split('\n').map((l) => JSON.parse(l));
}

describe('POST /api/assistant', () => {
  beforeEach(() => {
    streamCalls.length = 0;
    scripted.length = 0;
    runTool.mockClear();
    process.env.ANTHROPIC_API_KEY = 'test';
  });

  it('führt Werkzeuge aus und streamt die Antwort samt Verlauf', async () => {
    scripted.push(
      { content: [{ type: 'tool_use', id: 't1', name: 'meine_aufgaben', input: {} }], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'Du hast **3** offene Aufgaben.' }], stop_reason: 'end_turn', text: 'Du hast **3** offene Aufgaben.' },
    );
    const res = await POST(new NextRequest('http://x/api/assistant', { method: 'POST', body: JSON.stringify({ question: 'Was liegt an?', messages: [], page: '/meine-todos' }) }));
    const events = await readEvents(res);

    expect(runTool).toHaveBeenCalledOnce();
    expect(events.find((e) => e.type === 'tool')?.label).toBe('Schaut in deine Aufgaben');
    expect(events.filter((e) => e.type === 'text').map((e) => e.delta).join('')).toContain('3');
    const done = events.find((e) => e.type === 'done');
    // user → assistant(tool_use) → user(tool_result) → assistant(text)
    expect(done.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(done.messages[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
    // Modell, Effort und Fallback wie vorgesehen
    expect(streamCalls[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'low' } });
    expect(String(done.messages[0].content)).toContain('Seite: /meine-todos');
  });

  it('lehnt leere Fragen ab', async () => {
    const res = await POST(new NextRequest('http://x/api/assistant', { method: 'POST', body: JSON.stringify({ question: '  ' }) }));
    expect(res.status).toBe(400);
  });

  it('meldet fehlenden API-Schlüssel verständlich', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(new NextRequest('http://x/api/assistant', { method: 'POST', body: JSON.stringify({ question: 'Hi' }) }));
    expect(res.status).toBe(503);
  });
});
