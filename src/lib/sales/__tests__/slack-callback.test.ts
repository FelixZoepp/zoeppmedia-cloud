import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/notifications/create', () => ({
  createNotificationForInternals: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'row-1' }),
}));
vi.mock('@/lib/activity/log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { buildSalesSlackMessage, notifySales } from '../notify';
import { isCallbackReply, todayBerlin, handleSalesReply } from '../replies';
import { findCloseLeadIdByPhone } from '../close';
import { createNotificationForInternals } from '@/lib/notifications/create';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function json(data: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
}

describe('Slack #03-sales', () => {
  it('baut die Nachricht mit Telefon und Button "Chat öffnen"', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://cloud.zoeppmedia.de');
    const msg = buildSalesSlackMessage({
      emoji: '📞', title: 'Lead anrufen: Max', body: 'nicht bestätigt', type: 'task_due',
      phone: '+491511234567', conversationId: 'conv-1',
    });
    expect(msg.text).toBe('📞 Lead anrufen: Max: nicht bestätigt');
    expect(JSON.stringify(msg.blocks)).toContain('📱 +491511234567');
    expect(JSON.stringify(msg.blocks)).toContain('https://cloud.zoeppmedia.de/api/admin/sales-inbox?conversation=conv-1');
  });

  it('notifySales postet in den Sales-Kanal und erzeugt die App-Benachrichtigung', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test');
    vi.stubEnv('SLACK_SALES_CHANNEL', 'C05V2JZRFR9');
    fetchMock.mockReturnValue(json({ ok: true }));

    await notifySales({} as never, { emoji: '✅', title: 'Max hat bestätigt', body: 'x', type: 'system' });

    expect(fetchMock).toHaveBeenCalledWith('https://slack.com/api/chat.postMessage', expect.anything());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.channel).toBe('C05V2JZRFR9');
    expect(createNotificationForInternals).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Sales: Max hat bestätigt' }),
    );
  });

  it('Slack-Fehler bricht nichts ab', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test');
    vi.stubEnv('SLACK_SALES_CHANNEL', 'C1');
    fetchMock.mockReturnValue(json({ ok: false, error: 'channel_not_found' }));
    await expect(notifySales({} as never, { emoji: '✅', title: 't', body: 'b', type: 'system' })).resolves.toBeUndefined();
  });
});

describe('Rückrufwunsch', () => {
  it.each(['Ruf mich heute an', 'ruf mich bitte heute zurück', 'Rückruf bitte'])('erkennt "%s"', (t) => {
    expect(isCallbackReply(t)).toBe(true);
  });
  it.each(['Ja, ich bin dabei', 'Ich rufe an', 'Neuen Termin wählen'])('ignoriert "%s"', (t) => {
    expect(isCallbackReply(t)).toBe(false);
  });

  it('todayBerlin nutzt die Berliner Zeit', () => {
    expect(todayBerlin(new Date('2026-10-02T22:30:00Z'))).toBe('2026-10-03');
  });

  it('"Ruf mich heute an" → Aufgabe "Heute anrufen" am Close-Lead + Slack', async () => {
    vi.stubEnv('CLOSE_API_KEY', 'api_test');
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test');
    vi.stubEnv('SLACK_SALES_CHANNEL', 'C1');
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
      if (url.includes('/lead/?')) {
        return json({ data: [{ id: 'lead_1', contacts: [{ phones: [{ phone: '+49 177 1908503' }] }] }] });
      }
      if (url.endsWith('/task/') && init?.method === 'POST') return json({ id: 'task_1' });
      return json({ ok: true });
    });
    const svc = {
      from: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: { email: null }, error: null });
        return chain;
      }),
    } as never;

    const kind = await handleSalesReply(svc, {
      agencyId: 'sales', candidateId: 'p-1', candidateName: 'Riccardo Marini', candidatePhone: '+491771908503',
      conversationId: 'conv-1', waAccountId: 'wa-1', text: 'Ruf mich heute an',
    });

    expect(kind).toBe('callback');
    const taskCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/task/'));
    const task = JSON.parse(taskCall![1].body);
    expect(task).toMatchObject({ lead_id: 'lead_1', _type: 'lead', date: todayBerlin() });
    expect(task.text).toContain('Heute anrufen');
    const slack = fetchMock.mock.calls.find((c) => String(c[0]).includes('slack.com'));
    expect(JSON.parse(slack![1].body).text).toContain('Rückruf gewünscht: Riccardo Marini');
  });
});

describe('findCloseLeadIdByPhone', () => {
  it('gleicht Nummern formatunabhängig ab (+49 / 0 / Leerzeichen)', async () => {
    vi.stubEnv('CLOSE_API_KEY', 'api_test');
    fetchMock.mockReturnValue(
      json({ data: [
        { id: 'lead_other', contacts: [{ phones: [{ phone: '+49 170 1111111' }] }] },
        { id: 'lead_match', contacts: [{ phones: [{ phone: '0177 1908503' }] }] },
      ] }),
    );
    expect(await findCloseLeadIdByPhone('+491771908503')).toBe('lead_match');
  });
});
