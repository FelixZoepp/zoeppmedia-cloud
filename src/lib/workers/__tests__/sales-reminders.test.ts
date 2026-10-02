import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'row-1' }),
}));
vi.mock('@/lib/whatsapp/window', () => ({
  isQuietHours: vi.fn(() => false),
  nextAllowedTime: vi.fn(() => new Date()),
}));
vi.mock('@/lib/notifications/create', () => ({
  createNotificationForInternals: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/activity/log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { processSalesReminder } from '../sales-reminders';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';

/** whatsapp_templates antwortet je nach preset_key aus approvedTemplates. */
function makeSvc(approvedTemplates: Record<string, { id: string; name: string }>) {
  const rows: Record<string, unknown> = {
    calendly_events: {
      id: 'row-evt', candidate_id: 'p-1', agency_id: 'sales', status: 'scheduled',
      start_time: '2026-10-05T16:00:00Z', end_time: '2026-10-05T16:15:00Z',
    },
    candidates: { id: 'p-1', name: 'Felix Testkunde', phone_e164: '+4915202159031', whatsapp_opt_in: true },
    conversations: { id: 'conv-1', wa_account_id: 'wa-1' },
  };
  return {
    from: vi.fn((table: string) => {
      let presetKey: string | null = null;
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'filter', 'update']) chain[m] = vi.fn(() => chain);
      chain.eq = vi.fn((col: string, val: string) => {
        if (col === 'preset_key') presetKey = val;
        return chain;
      });
      chain.maybeSingle = vi.fn(async () => ({
        data: table === 'whatsapp_templates' ? approvedTemplates[presetKey ?? ''] ?? null : rows[table] ?? null,
        error: null,
      }));
      return chain;
    }),
  } as never;
}

function sentTemplate() {
  const call = (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
  return {
    name: call.payload.template.name as string,
    params: call.payload.template.components[0].parameters.map((p: { text: string }) => p.text) as string[],
  };
}

describe('processSalesReminder — Utility-Neufassung (_v2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('nutzt setting_reminder_15min_v2 mit Uhrzeit, sobald sie freigegeben ist', async () => {
    await processSalesReminder(
      makeSvc({
        setting_reminder_15min_v2: { id: 't2', name: 'setting_reminder_15min_v2' },
        setting_reminder_15min: { id: 't1', name: 'setting_reminder_15min' },
      }),
      'sales',
      { calendly_event_id: 'evt-1', chain: 'setting' },
    );
    expect(sentTemplate()).toEqual({ name: 'setting_reminder_15min_v2', params: ['Felix', '18:00'] });
  });

  it('fällt auf die alte Vorlage zurück, solange _v2 noch nicht freigegeben ist', async () => {
    await processSalesReminder(
      makeSvc({ setting_reminder_15min: { id: 't1', name: 'setting_reminder_15min' } }),
      'sales',
      { calendly_event_id: 'evt-1', chain: 'setting' },
    );
    expect(sentTemplate()).toEqual({ name: 'setting_reminder_15min', params: ['Felix'] });
  });
});
