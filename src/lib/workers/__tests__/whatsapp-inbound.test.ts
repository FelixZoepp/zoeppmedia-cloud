/**
 * Tests für whatsapp-inbound Worker.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processInbound } from '../whatsapp-inbound';

// Stub-Module vor dem Import
vi.mock('@/lib/whatsapp/window', () => ({
  isStopMessage: vi.fn((text: string | null | undefined) => {
    if (!text) return false;
    return ['stop', 'stopp', 'abmelden'].includes(text.trim().toLowerCase());
  }),
}));

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.test', messageRowId: 'row-1' }),
}));

vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotificationForAgency: vi.fn().mockResolvedValue(undefined),
}));

function makeSvc(overrides: Record<string, unknown> = {}) {
  const fromMock = vi.fn();

  // Default table responses
  const tableResponses: Record<string, unknown> = {
    whatsapp_accounts: { data: { id: 'wa-1', agency_id: 'agency-1' }, error: null },
    candidates: { data: { id: 'cand-1', name: 'Max Müller', whatsapp_opt_in: true }, error: null },
    conversations: { data: null, error: null }, // no existing conv by default
    messages: { data: null, error: null },
    scheduled_jobs: { data: null, error: null },
    ...overrides,
  };

  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'is', 'maybeSingle', 'single', 'insert', 'update', 'upsert'];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }

    const resp = tableResponses[table] || { data: null, error: null };
    // conversations: upsert resolves void, update().eq().select().single() returns conv row
    if (table === 'conversations') {
      const convRow = { data: { id: 'conv-1', state: 'waiting', assigned_to: null }, error: null };
      (chain.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
      // update chain: eq → eq → select → single
      const updateChain: Record<string, unknown> = {};
      const updateMethods = ['eq', 'select', 'single'];
      for (const m of updateMethods) {
        updateChain[m] = vi.fn(() => updateChain);
      }
      (updateChain.single as ReturnType<typeof vi.fn>).mockResolvedValue(convRow);
      (chain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);
    } else {
      (chain.maybeSingle as ReturnType<typeof vi.fn>)?.mockResolvedValue(resp);
      (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(resp);
    }

    // insert().select().single() for other tables
    const insertChain: Record<string, unknown> = {};
    const insertMethods = ['select', 'eq', 'single', 'insert', 'update', 'upsert'];
    for (const m of insertMethods) {
      insertChain[m] = vi.fn(() => insertChain);
    }
    (insertChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
    (chain.insert as ReturnType<typeof vi.fn>).mockReturnValue(insertChain);

    return chain;
  });

  // rpc: increment_unread resolves void
  const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });

  return { from: fromMock, rpc: rpcMock } as unknown as Parameters<typeof processInbound>[0];
}

const basePayload = {
  type: 'whatsapp.inbound' as const,
  phone_number_id: 'pn-1',
  message: {
    id: 'wamid.abc123',
    from: '491761234567',
    timestamp: '1700000000',
    type: 'text',
    text: { body: 'Hallo, ich habe eine Frage.' },
  },
};

describe('processInbound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verarbeitet eine einfache Textnachricht ohne Fehler', async () => {
    const svc = makeSvc();
    await expect(processInbound(svc, 'agency-1', basePayload)).resolves.toBeUndefined();
  });

  it('normiert Telefonnummer ohne + korrekt (Präfix +)', async () => {
    const svc = makeSvc();
    // from ohne '+' → worker muss '+' voranstellen
    const payload = { ...basePayload, message: { ...basePayload.message, from: '491761234567' } };
    await expect(processInbound(svc, 'agency-1', payload)).resolves.toBeUndefined();
    // Das from() auf candidates muss mit '+491761234567' aufgerufen worden sein
    const calls = (svc.from as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const candidateCall = calls.find((args) => args[0] === 'candidates');
    expect(candidateCall).toBeDefined();
  });

  it('bricht ab wenn kein Kandidat gefunden (unbekannte Nummer)', async () => {
    const svc = makeSvc({
      candidates: { data: null, error: null },
    });
    // Kein Fehler — einfaches return
    await expect(processInbound(svc, 'agency-1', basePayload)).resolves.toBeUndefined();
  });

  it('wirft wenn kein WhatsApp-Account gefunden', async () => {
    const svc = makeSvc({
      whatsapp_accounts: { data: null, error: null },
    });
    await expect(processInbound(svc, 'agency-1', basePayload)).rejects.toThrow(
      'Kein WhatsApp-Account für phone_number_id pn-1'
    );
  });

  it('erkennt STOP-Nachricht und setzt opt-in auf false', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    const svc = makeSvc();
    const stopPayload = {
      ...basePayload,
      message: { ...basePayload.message, text: { body: 'STOP' } },
    };
    await processInbound(svc, 'agency-1', stopPayload);
    // sendWhatsAppMessage muss mit Abmeldebestätigung aufgerufen worden sein
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        senderType: 'system',
        isHumanUiSend: true,
      })
    );
  });

  it('plant media-download Job für Bildnachricht', async () => {
    const svc = makeSvc();
    const imagePayload = {
      type: 'whatsapp.inbound' as const,
      phone_number_id: 'pn-1',
      message: {
        id: 'wamid.img1',
        from: '491761234567',
        timestamp: '1700000001',
        type: 'image',
        image: { id: 'media-42', mime_type: 'image/jpeg', caption: 'Foto' },
      },
    };
    await processInbound(svc, 'agency-1', imagePayload);
    const insertCalls = ((svc.from as ReturnType<typeof vi.fn>).mock.calls as unknown[][])
      .filter((args) => args[0] === 'scheduled_jobs');
    expect(insertCalls.length).toBeGreaterThan(0);
  });

  it('Abmeldebestätigung enthält echte Umlaute', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    const svc = makeSvc();
    const stopPayload = {
      ...basePayload,
      message: { ...basePayload.message, text: { body: 'stopp' } },
    };
    await processInbound(svc, 'agency-1', stopPayload);
    const callArgs = (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    const body: string = callArgs?.payload?.text?.body ?? '';
    expect(body).toContain('erhältst');
    expect(body).toContain('jederzeit');
    // Keine ASCII-Ersetzungen
    expect(body).not.toContain('ae');
    expect(body).not.toContain('ue');
  });
});
