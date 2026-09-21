/**
 * Tests für whatsapp-status Worker.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processStatus } from '../whatsapp-status';

function makeSvc() {
  const updateChain = {
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const chain = {
    update: vi.fn(() => updateChain),
  };
  const from = vi.fn(() => chain);
  return { from, _chain: chain, _updateChain: updateChain } as unknown as {
    from: ReturnType<typeof vi.fn>;
    _chain: typeof chain;
    _updateChain: typeof updateChain;
  };
}

describe('processStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aktualisiert Status auf delivered', async () => {
    const { from, _chain, _updateChain } = makeSvc();
    const svc = { from } as unknown as Parameters<typeof processStatus>[0];

    await processStatus(svc, {
      type: 'whatsapp.status',
      phone_number_id: 'pn-1',
      status: {
        id: 'wamid.abc',
        status: 'delivered',
        timestamp: '1700000000',
        recipient_id: '+491761234567',
      },
    });

    expect(from).toHaveBeenCalledWith('messages');
    expect(_chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'delivered' }));
    expect(_updateChain.eq).toHaveBeenCalledWith('wa_message_id', 'wamid.abc');
  });

  it('schreibt error_code bei failed-Status mit Fehlerdetails', async () => {
    const { from, _chain } = makeSvc();
    const svc = { from } as unknown as Parameters<typeof processStatus>[0];

    await processStatus(svc, {
      type: 'whatsapp.status',
      phone_number_id: 'pn-1',
      status: {
        id: 'wamid.xyz',
        status: 'failed',
        timestamp: '1700000001',
        recipient_id: '+491761234567',
        errors: [{ code: 131047, title: 'Message failed to send' }],
      },
    });

    expect(_chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error_code: '131047: Message failed to send',
      })
    );
  });

  it('schreibt kein error_code wenn kein errors-Array', async () => {
    const { from, _chain } = makeSvc();
    const svc = { from } as unknown as Parameters<typeof processStatus>[0];

    await processStatus(svc, {
      type: 'whatsapp.status',
      phone_number_id: 'pn-1',
      status: {
        id: 'wamid.read1',
        status: 'read',
        timestamp: '1700000002',
        recipient_id: '+491761234567',
      },
    });

    const updateArg = (_chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('error_code');
  });
});
