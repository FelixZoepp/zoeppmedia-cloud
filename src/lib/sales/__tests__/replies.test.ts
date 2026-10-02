import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'row-1' }),
}));
vi.mock('@/lib/notifications/create', () => ({
  createNotificationForInternals: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/activity/log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../close', () => ({
  addCloseNoteByEmail: vi.fn().mockResolvedValue(true),
}));

import { isConfirmationReply, parseKundenVideos, buildKundenVideosText, handleSalesReply } from '../replies';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';
import { addCloseNoteByEmail } from '../close';

/** Minimaler Supabase-Mock: jede Tabelle liefert die hinterlegte Antwort für maybeSingle(). */
function makeSvc(responses: Record<string, unknown>) {
  return {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'gte', 'order', 'limit']) chain[m] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: responses[table] ?? null, error: null });
      return chain;
    }),
  } as unknown as Parameters<typeof handleSalesReply>[0];
}

const input = {
  agencyId: 'sales-agency',
  candidateId: 'cand-1',
  candidateName: 'Miró Neumann',
  candidatePhone: '+491511234567',
  conversationId: 'conv-1',
  waAccountId: 'wa-1',
  text: 'Ja, ich bin dabei',
};

const beratungEvent = {
  id: 'row-1',
  calendly_event_id: 'evt-123',
  event_type: '60min Beratungsgespräch mit Felix Zoepp',
  start_time: '2026-10-07T11:00:00Z',
  invitee_email: 'miro@example.com',
};

describe('isConfirmationReply', () => {
  it.each(['Ja, ich bin dabei', 'ja ich bin dabei!', 'Ja', 'passt', 'Bin dabei'])('erkennt "%s"', (t) => {
    expect(isConfirmationReply(t)).toBe(true);
  });
  it.each(['Verschieben', 'Kann leider nicht', 'Ja, aber später?', '', null])('ignoriert "%s"', (t) => {
    expect(isConfirmationReply(t)).toBe(false);
  });
});

describe('parseKundenVideos', () => {
  it('liest "Titel | URL" pro Zeile und ignoriert kaputte Zeilen', () => {
    expect(
      parseKundenVideos('Kunde A: 12 neue Vertriebler | https://youtu.be/a\nohne Link\nKunde B | ftp://x\nKunde C | https://youtu.be/c'),
    ).toEqual([
      { titel: 'Kunde A: 12 neue Vertriebler', url: 'https://youtu.be/a' },
      { titel: 'Kunde C', url: 'https://youtu.be/c' },
    ]);
  });
  it('akzeptiert \\n als Trenner (Vercel-Env in einer Zeile)', () => {
    expect(parseKundenVideos('A | https://a.de\\nB | https://b.de')).toHaveLength(2);
  });
  it('leer → keine Videos', () => {
    expect(parseKundenVideos(undefined)).toEqual([]);
  });
});

describe('buildKundenVideosText', () => {
  it('nennt Vorname und alle Links', () => {
    const text = buildKundenVideosText('Miró', [{ titel: 'Kunde A', url: 'https://youtu.be/a' }]);
    expect(text).toContain('Miró');
    expect(text).toContain('▶ Kunde A\nhttps://youtu.be/a');
  });
});

describe('handleSalesReply', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('ignoriert Antworten, die keine Bestätigung sind', async () => {
    const svc = makeSvc({ calendly_events: beratungEvent });
    await handleSalesReply(svc, { ...input, text: 'Verschieben' });
    expect(svc.from).not.toHaveBeenCalled();
  });

  it('Bestätigung Beratung → Log, Benachrichtigung, Close-Notiz und Kundenvideos', async () => {
    vi.stubEnv('SALES_KUNDENVIDEOS', 'Kunde A | https://youtu.be/a');
    await handleSalesReply(makeSvc({ calendly_events: beratungEvent }), input);

    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action_type: 'other',
        metadata: { kind: 'sales_confirmed', calendly_event_id: 'evt-123' },
      }),
    );
    expect(createNotificationForInternals).toHaveBeenCalledOnce();
    expect(addCloseNoteByEmail).toHaveBeenCalledWith('miro@example.com', expect.stringContaining('bestätigt'));
    expect(sendWhatsAppMessage).toHaveBeenCalledOnce();
    const send = (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(send.payload.type).toBe('text');
    expect(send.payload.text.body).toContain('https://youtu.be/a');
  });

  it('Bestätigung Erstgespräch → keine Videos', async () => {
    vi.stubEnv('SALES_KUNDENVIDEOS', 'Kunde A | https://youtu.be/a');
    await handleSalesReply(
      makeSvc({ calendly_events: { ...beratungEvent, event_type: 'Analysegespräch mit Zoepp Media' } }),
      input,
    );
    expect(addCloseNoteByEmail).toHaveBeenCalledOnce();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('Beratung ohne konfigurierte Videos → nichts senden', async () => {
    await handleSalesReply(makeSvc({ calendly_events: beratungEvent }), input);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('zweite Bestätigung zum selben Termin löst nichts erneut aus', async () => {
    vi.stubEnv('SALES_KUNDENVIDEOS', 'Kunde A | https://youtu.be/a');
    await handleSalesReply(makeSvc({ calendly_events: beratungEvent, activity_log: { id: 'log-1' } }), input);
    expect(logActivity).not.toHaveBeenCalled();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('kein offener Termin → nichts tun', async () => {
    await handleSalesReply(makeSvc({}), input);
    expect(logActivity).not.toHaveBeenCalled();
  });
});
