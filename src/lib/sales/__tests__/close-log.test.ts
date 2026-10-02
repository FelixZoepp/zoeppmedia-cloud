import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderTemplateBody, outgoingText, processSalesCloseLog } from '../close-log';

const fetchMock = vi.fn();
const ok = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => data, text: async () => '' });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('CLOSE_API_KEY', 'api_test');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Text der Nachricht für Close', () => {
  it('füllt Vorlagen-Variablen', () => {
    expect(renderTemplateBody('Hallo {{1}}, wir telefonieren {{2}} um {{3}} Uhr.', ['Max', 'morgen', '14:00'])).toBe(
      'Hallo Max, wir telefonieren morgen um 14:00 Uhr.',
    );
  });

  it('Vorlage → echter Text statt Vorlagenname', async () => {
    const svc = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { body: 'Hallo {{1}}!' } }) }) }) }),
    } as never;
    const text = await outgoingText(
      svc,
      { to: '+49', type: 'template', template: { name: 'fu_1', language: { code: 'de' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Max' }] }] } },
      'tmpl-1',
    );
    expect(text).toBe('Hallo Max!');
  });
});

describe('processSalesCloseLog', () => {
  it('legt die Nachricht als WhatsApp-Aktivität am passenden Kontakt ab (eingehend → Close-Inbox)', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('/lead/?')
        ? ok({ data: [{ id: 'lead_1', contacts: [{ id: 'cont_1', phones: [{ phone: '+49 177 1908503' }] }] }] })
        : ok({ id: 'acti_1' }),
    );

    const r = await processSalesCloseLog({
      direction: 'incoming', text: 'Ja, ich bin dabei', phone: '+491771908503', waMessageId: 'wamid.X', at: '2026-10-02T16:05:07Z',
    });

    expect(r).toBe('logged');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api.close.com/api/v1/activity/whatsapp_message/?send_to_inbox=true');
    expect(JSON.parse(init.body)).toEqual({
      lead_id: 'lead_1', contact_id: 'cont_1', direction: 'incoming', external_whatsapp_message_id: 'wamid.X',
      message_markdown: 'Ja, ich bin dabei', local_phone: '493082684175', remote_phone: '491771908503',
      activity_at: '2026-10-02T16:05:07Z',
    });
  });

  it('kein Lead in Close → still überspringen', async () => {
    fetchMock.mockReturnValue(ok({ data: [] }));
    const r = await processSalesCloseLog({ direction: 'outgoing', text: 'x', phone: '+491511111111', waMessageId: 'w', at: 'now' });
    expect(r).toBe('no_lead');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
