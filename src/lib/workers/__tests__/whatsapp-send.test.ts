/**
 * Tests für whatsapp-send Worker.
 * R4: sendWhatsAppMessage wirft bei Fehler — kein result.ok-Check.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processSend } from '../whatsapp-send';

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.sent', messageRowId: 'row-99' }),
}));

const baseJobPayload = {
  agency_id: 'agency-1',
  conversation_id: 'conv-1',
  candidate_phone: '+491761234567',
  wa_account_id: 'wa-1',
  payload: { to: '+491761234567', type: 'text', text: { body: 'Hallo!' } },
  sender_type: 'bot' as const,
};

describe('processSend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ruft sendWhatsAppMessage mit korrekten Parametern auf', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    const svc = {} as Parameters<typeof processSend>[0];

    await processSend(svc, baseJobPayload);

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      svc,
      expect.objectContaining({
        agencyId: 'agency-1',
        conversationId: 'conv-1',
        candidatePhone: '+491761234567',
        waAccountId: 'wa-1',
        senderType: 'bot',
        userId: null,
        templateId: null,
      })
    );
  });

  it('wirft weiter wenn sendWhatsAppMessage fehlschlägt (R4)', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('24-Stunden-Fenster geschlossen — nur Vorlagen erlaubt')
    );
    const svc = {} as Parameters<typeof processSend>[0];

    await expect(processSend(svc, baseJobPayload)).rejects.toThrow(
      '24-Stunden-Fenster geschlossen — nur Vorlagen erlaubt'
    );
  });

  it('übergibt user_id und template_id wenn vorhanden', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    const svc = {} as Parameters<typeof processSend>[0];

    await processSend(svc, {
      ...baseJobPayload,
      sender_type: 'user',
      user_id: 'user-42',
      template_id: 'tmpl-7',
    });

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      svc,
      expect.objectContaining({ userId: 'user-42', templateId: 'tmpl-7' })
    );
  });
});
