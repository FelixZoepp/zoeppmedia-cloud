/**
 * Tests für sendWhatsAppMessage (Task 5 Review, I3).
 * Mocked: Supabase-Client (Chainable Stub), Provider, decryptSecret.
 *
 * Vertrag (C1): Funktion wirft bei Fehler, löst bei Erfolg mit { messageId, messageRowId } auf.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Provider-Mock — muss vor dem Import von send.ts registriert werden
// ---------------------------------------------------------------------------
vi.mock('@/lib/whatsapp/provider', () => ({
  getProvider: vi.fn(),
}));

vi.mock('@/lib/crypto', () => ({
  decryptSecret: vi.fn(() => 'decrypted-token'),
}));

// ---------------------------------------------------------------------------
// Hilfsfunktionen für den Chainable-Supabase-Stub
// ---------------------------------------------------------------------------

type QueryResult = { data: unknown; error: unknown };

/** Erstellt einen chainbaren Stub, der am Ende .single() → result auflöst. */
function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  const noop = () => chain;
  chain.select = noop;
  chain.eq = noop;
  chain.insert = noop;
  chain.update = noop;
  chain.single = () => Promise.resolve(result);
  return chain;
}

/** Erstellt einen minimalen Supabase-Client-Stub. */
function makeSupabase(tableMap: Record<string, QueryResult | (() => QueryResult)>) {
  return {
    from: (table: string) => {
      const entry = tableMap[table];
      const result = typeof entry === 'function' ? entry() : (entry ?? { data: null, error: null });
      return makeChain(result);
    },
  };
}

// ---------------------------------------------------------------------------
// Gemeinsame Test-Optionen
// ---------------------------------------------------------------------------

const BASE_OPTS = {
  agencyId: 'agency-1',
  conversationId: 'conv-1',
  candidatePhone: '+491701234567',
  waAccountId: 'wa-account-1',
  payload: { to: '+491701234567', type: 'text' as const, text: { body: 'Hallo!' } },
  senderType: 'bot' as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendWhatsAppMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(1) Preflight-Fehler (kein Consent) → wirft deutschen Fehler, keine Message-Row angelegt', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    // insertSpy überwacht, ob messages.insert jemals aufgerufen wird
    const insertSpy = vi.fn(() => makeChain({ data: { id: 'msg-1' }, error: null }));

    const svc = {
      from: (table: string) => {
        if (table === 'whatsapp_accounts') {
          return makeChain({ data: { id: 'wa-account-1', phone_number_id: 'pn-1', access_token_enc: 'enc', status: 'connected' }, error: null });
        }
        if (table === 'conversations') {
          return makeChain({ data: { window_expires_at: new Date(Date.now() + 3600_000).toISOString(), candidate_id: 'cand-1' }, error: null });
        }
        if (table === 'candidates') {
          // kein Consent
          return makeChain({ data: { whatsapp_opt_in: false }, error: null });
        }
        if (table === 'agencies') {
          return makeChain({ data: { timezone: 'Europe/Berlin' }, error: null });
        }
        if (table === 'messages') {
          const chain = makeChain({ data: { id: 'msg-1' }, error: null });
          (chain as Record<string, unknown>).insert = insertSpy;
          return chain;
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as Parameters<typeof sendWhatsAppMessage>[0];

    await expect(sendWhatsAppMessage(svc, BASE_OPTS)).rejects.toThrow('Einwilligung');
    // Keine Message-Row darf angelegt worden sein
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('(2) Provider-Erfolg → löst mit { messageId, messageRowId } auf, Row auf status sent gesetzt', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    const { getProvider } = await import('@/lib/whatsapp/provider');

    const mockSendMessage = vi.fn().mockResolvedValue({ messageId: 'wamid-abc123' });
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({ sendMessage: mockSendMessage });

    // Alle updates/selects speichern
    const updatedRows: Array<{ status: string; wa_message_id?: string }> = [];

    const svc = {
      from: (table: string) => {
        const base = makeChain({ data: null, error: null });

        if (table === 'whatsapp_accounts') {
          return makeChain({ data: { id: 'wa-account-1', phone_number_id: 'pn-1', access_token_enc: 'enc', status: 'connected' }, error: null });
        }
        if (table === 'conversations') {
          return makeChain({ data: { window_expires_at: new Date(Date.now() + 3600_000).toISOString(), candidate_id: 'cand-1' }, error: null });
        }
        if (table === 'candidates') {
          return makeChain({ data: { whatsapp_opt_in: true }, error: null });
        }
        if (table === 'agencies') {
          return makeChain({ data: { timezone: 'Europe/Berlin' }, error: null });
        }
        if (table === 'messages') {
          // insert → gibt msgRow zurück; update → speichert aufgezeichnete Werte
          const chain: Record<string, unknown> = {};
          chain.insert = (_data: unknown) => {
            const inner: Record<string, unknown> = {};
            inner.select = () => inner;
            inner.single = () => Promise.resolve({ data: { id: 'msg-row-1' }, error: null });
            return inner;
          };
          chain.update = (patch: Record<string, unknown>) => {
            updatedRows.push(patch as { status: string; wa_message_id?: string });
            const inner: Record<string, unknown> = {};
            inner.eq = () => Promise.resolve({ data: null, error: null });
            return inner;
          };
          return chain;
        }

        // conversations update
        (base as Record<string, unknown>).update = () => {
          const inner: Record<string, unknown> = {};
          inner.eq = () => Promise.resolve({ data: null, error: null });
          return inner;
        };
        return base;
      },
    } as unknown as Parameters<typeof sendWhatsAppMessage>[0];

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:00Z')); // Mittwoch 12:00 Berlin — keine Ruhezeit

    const result = await sendWhatsAppMessage(svc, BASE_OPTS);

    vi.useRealTimers();

    expect(result).toEqual({ messageId: 'wamid-abc123', messageRowId: 'msg-row-1' });
    const sentUpdate = updatedRows.find(r => r.status === 'sent');
    expect(sentUpdate).toBeDefined();
    expect(sentUpdate?.wa_message_id).toBe('wamid-abc123');
  });

  it('(3) Provider wirft → Row auf status failed mit sanitiertem error_code, Fehler re-thrown', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    const { getProvider } = await import('@/lib/whatsapp/provider');

    const providerError = new Error('WhatsApp API Fehler 400: invalid phone number');
    const mockSendMessage = vi.fn().mockRejectedValue(providerError);
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({ sendMessage: mockSendMessage });

    const updatedRows: Array<{ status: string; error_code?: string }> = [];

    const svc = {
      from: (table: string) => {
        if (table === 'whatsapp_accounts') {
          return makeChain({ data: { id: 'wa-account-1', phone_number_id: 'pn-1', access_token_enc: 'enc', status: 'connected' }, error: null });
        }
        if (table === 'conversations') {
          return makeChain({ data: { window_expires_at: new Date(Date.now() + 3600_000).toISOString(), candidate_id: 'cand-1' }, error: null });
        }
        if (table === 'candidates') {
          return makeChain({ data: { whatsapp_opt_in: true }, error: null });
        }
        if (table === 'agencies') {
          return makeChain({ data: { timezone: 'Europe/Berlin' }, error: null });
        }
        if (table === 'messages') {
          const chain: Record<string, unknown> = {};
          chain.insert = (_data: unknown) => {
            const inner: Record<string, unknown> = {};
            inner.select = () => inner;
            inner.single = () => Promise.resolve({ data: { id: 'msg-row-1' }, error: null });
            return inner;
          };
          chain.update = (patch: Record<string, unknown>) => {
            updatedRows.push(patch as { status: string; error_code?: string });
            const inner: Record<string, unknown> = {};
            inner.eq = () => Promise.resolve({ data: null, error: null });
            return inner;
          };
          return chain;
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as Parameters<typeof sendWhatsAppMessage>[0];

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:00Z'));

    await expect(sendWhatsAppMessage(svc, BASE_OPTS)).rejects.toThrow('WhatsApp API Fehler 400');

    vi.useRealTimers();

    const failedUpdate = updatedRows.find(r => r.status === 'failed');
    expect(failedUpdate).toBeDefined();
    // error_code muss vorhanden und ≤ 200 Zeichen sein
    expect(typeof failedUpdate?.error_code).toBe('string');
    expect((failedUpdate?.error_code ?? '').length).toBeLessThanOrEqual(200);
    // decrypted-token darf nicht in error_code auftauchen
    expect(failedUpdate?.error_code).not.toContain('decrypted-token');
  });
});
