import { describe, it, expect, vi } from 'vitest';
import { createContactFromWhatsApp, formatPhoneForName, WHATSAPP_INBOUND_SOURCE } from '../unknown-contact';

function fakeSvc(opts: { stage?: unknown; insert?: { data: unknown; error: unknown }; existing?: unknown }) {
  const inserts: Record<string, unknown>[] = [];
  const svc = {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'order', 'limit', 'eq', 'is']) chain[m] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () =>
        table === 'pipeline_stages'
          ? { data: opts.stage === undefined ? { id: 'stage-1' } : opts.stage, error: null }
          : { data: opts.existing ?? null, error: null },
      );
      chain.insert = vi.fn((row: Record<string, unknown>) => {
        inserts.push(row);
        const after: Record<string, unknown> = {};
        after.select = vi.fn(() => after);
        after.single = vi.fn(async () => opts.insert ?? { data: { id: 'c-new', name: row.name, whatsapp_opt_in: true }, error: null });
        return after;
      });
      return chain;
    }),
  };
  return { svc: svc as never, inserts };
}

describe('createContactFromWhatsApp', () => {
  it('legt Kontakt mit Profilname, Nummer und WhatsApp-Markierung an', async () => {
    const { svc, inserts } = fakeSvc({});
    const c = await createContactFromWhatsApp(svc, 'ag-1', '+4917612345678', 'Lisa Kern');
    expect(c).toEqual({ id: 'c-new', name: 'Lisa Kern', whatsapp_opt_in: true });
    expect(inserts[0]).toMatchObject({
      agency_id: 'ag-1',
      name: 'Lisa Kern',
      phone_e164: '+4917612345678',
      source: 'manual',
      current_stage_id: 'stage-1',
      whatsapp_opt_in: true,
      consent_source: WHATSAPP_INBOUND_SOURCE,
    });
  });

  it('nimmt ohne Profilname die formatierte Nummer als Namen', async () => {
    const { svc, inserts } = fakeSvc({});
    await createContactFromWhatsApp(svc, 'ag-1', '+4917612345678', null);
    expect(inserts[0].name).toBe('+49 176 12345678');
  });

  it('greift bei Insert-Konflikt auf den vorhandenen Kontakt zurück', async () => {
    const { svc } = fakeSvc({ insert: { data: null, error: { code: '23505' } }, existing: { id: 'c-old', name: 'Alt', whatsapp_opt_in: true } });
    expect(await createContactFromWhatsApp(svc, 'ag-1', '+4917612345678', 'X')).toEqual({ id: 'c-old', name: 'Alt', whatsapp_opt_in: true });
  });

  it('ohne Pipeline-Stage nichts anlegen', async () => {
    const { svc, inserts } = fakeSvc({ stage: null });
    expect(await createContactFromWhatsApp(svc, 'ag-1', '+4917612345678', 'X')).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  it('formatiert deutsche Mobilnummern', () => {
    expect(formatPhoneForName('+4915112345678')).toBe('+49 151 12345678');
    expect(formatPhoneForName('+436641234567')).toBe('+436641234567');
  });
});
