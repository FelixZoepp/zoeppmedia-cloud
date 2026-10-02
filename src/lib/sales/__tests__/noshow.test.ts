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
vi.mock('../close', async (orig) => ({
  ...(await orig<typeof import('../close')>()),
  getCloseLeadContacts: vi.fn(),
  addCloseNoteByEmail: vi.fn().mockResolvedValue(true),
}));

import { handleCloseSettingNoShow } from '../noshow';
import { getCloseLeadContacts, closeWebhookToken, CLOSE_STATUS_SETTING_NO_SHOW } from '../close';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';

/** responses[table] → maybeSingle(); `${table}.single` → single(); `${table}.calls` sammelt in()-Argumente */
function makeSvc(responses: Record<string, unknown>) {
  const inCalls: Array<{ table: string; col: string; values: unknown }> = [];
  const svc = {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'limit', 'upsert']) chain[m] = vi.fn(() => chain);
      chain.in = vi.fn((col: string, values: unknown) => {
        inCalls.push({ table, col, values });
        return chain;
      });
      chain.maybeSingle = vi.fn(async () => {
        const r = responses[table];
        return { data: typeof r === 'function' ? r(inCalls) : r ?? null, error: null };
      });
      chain.single = vi.fn().mockResolvedValue({ data: responses[`${table}.single`] ?? null, error: null });
      return chain;
    }),
  };
  return { svc: svc as never, inCalls };
}

const prospect = { id: 'p-1', name: 'Riccardo Marini', phone_e164: '+491771908503', whatsapp_opt_in: true };
const approved = { id: 'tmpl-ns', name: 'noshow_1_anruf' };

describe('handleCloseSettingNoShow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('findet den Prospect über die Telefonnummer aus Close und sendet noshow_1_anruf', async () => {
    (getCloseLeadContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
      leadName: 'Marini GmbH', contactName: 'Riccardo Marini', phones: ['0177 1908503'], emails: [],
    });
    const { svc, inCalls } = makeSvc({
      candidates: prospect,
      whatsapp_templates: approved,
      'conversations.single': { id: 'conv-1' },
    });

    const result = await handleCloseSettingNoShow(svc, { opportunityId: 'oppo_1', leadId: 'lead_1' });

    expect(result).toBe('sent');
    expect(inCalls[0]).toEqual({ table: 'candidates', col: 'phone_e164', values: ['+491771908503'] });
    const send = (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(send.payload.template.name).toBe('noshow_1_anruf');
    expect(send.payload.template.components).toEqual([{ type: 'body', parameters: [{ type: 'text', text: 'Riccardo' }] }]);
    expect(send.conversationId).toBe('conv-1');
    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: expect.objectContaining({ kind: 'sales_noshow_sent', close_opportunity_id: 'oppo_1' }) }),
    );
  });

  it('kein passender WhatsApp-Kontakt → Hinweis an das Team, nichts senden', async () => {
    (getCloseLeadContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
      leadName: 'X', contactName: null, phones: ['0170 000000'], emails: ['x@example.com'],
    });
    const { svc } = makeSvc({});
    expect(await handleCloseSettingNoShow(svc, { opportunityId: 'o', leadId: 'l' })).toBe('prospect_not_found');
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(createNotificationForInternals).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Sales: No-Show ohne WhatsApp-Kontakt: X' }),
    );
  });

  it('wurde für diese Opportunity schon gesendet → nicht erneut', async () => {
    (getCloseLeadContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
      leadName: null, contactName: null, phones: ['+491771908503'], emails: [],
    });
    const { svc } = makeSvc({ candidates: prospect, activity_log: { id: 'log' }, whatsapp_templates: approved });
    expect(await handleCloseSettingNoShow(svc, { opportunityId: 'o', leadId: 'l' })).toBe('already_sent');
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('Prospect hat STOP geschrieben → nichts senden', async () => {
    (getCloseLeadContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
      leadName: null, contactName: null, phones: ['+491771908503'], emails: [],
    });
    const { svc } = makeSvc({ candidates: { ...prospect, whatsapp_opt_in: false } });
    expect(await handleCloseSettingNoShow(svc, { opportunityId: 'o', leadId: 'l' })).toBe('opted_out');
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });
});

describe('Close-Webhook-Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  async function post(token: string | null, event: Record<string, unknown>) {
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }));
    vi.doMock('../noshow', () => ({ handleCloseSettingNoShow: vi.fn().mockResolvedValue('sent') }));
    const { POST } = await import('@/app/api/webhooks/close/route');
    const { handleCloseSettingNoShow: handler } = await import('../noshow');
    const url = new URL(`https://cloud.zoeppmedia.de/api/webhooks/close${token ? `?token=${token}` : ''}`);
    const res = await POST({ nextUrl: url, json: async () => ({ event }) } as never);
    return { res, handler: handler as ReturnType<typeof vi.fn> };
  }

  const noShowEvent = {
    object_type: 'opportunity', action: 'updated', object_id: 'oppo_1', lead_id: 'lead_1',
    changed_fields: ['status_id', 'status_label'],
    data: { status_id: CLOSE_STATUS_SETTING_NO_SHOW }, previous_data: { status_id: 'stat_terminiert' },
  };

  it('ohne gültigen Token → 401', async () => {
    const { res, handler } = await post('falsch', noShowEvent);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('Wechsel auf "Setting - No Show" → No-Show-Versand', async () => {
    const { res, handler } = await post(closeWebhookToken(), noShowEvent);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(expect.anything(), { opportunityId: 'oppo_1', leadId: 'lead_1' });
  });

  it('andere Status-Wechsel werden ignoriert', async () => {
    const { handler } = await post(closeWebhookToken(), { ...noShowEvent, data: { status_id: 'stat_closing' } });
    expect(handler).not.toHaveBeenCalled();
  });
});
