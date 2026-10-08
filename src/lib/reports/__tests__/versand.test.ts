import { describe, it, expect, vi } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';

vi.mock('@/lib/email/resend', () => ({ sendReportEmail: vi.fn() }));
const { versendeReport } = await import('../versand');

const report = { id: 'r1', agency_id: 'k1', typ: 'tag_7' as const, daten_json: { leads: 12 } };

describe('Report-Versand', () => {
  it('schickt an die Kunden-Adresse und markiert als versendet', async () => {
    const { client, tables } = createFakeDb({
      agencies: [{ id: 'k1', name: 'Muster GmbH', email: 'chef@muster.de' }],
      reports: [{ id: 'r1', agency_id: 'k1', status: 'generiert' }],
      activity_log: [],
    });
    const senden = vi.fn(async () => ({ data: { id: 'm1' }, error: null }));
    expect(await versendeReport(client, report, { senden: senden as never })).toEqual({ ok: true, email: 'chef@muster.de' });
    expect(senden).toHaveBeenCalledWith('chef@muster.de', 'tag_7', { leads: 12 }, 'Muster GmbH', expect.stringContaining('/reports'));
    expect(tables.reports[0]).toMatchObject({ status: 'versendet' });
    expect(tables.activity_log[0]).toMatchObject({ action_type: 'report_sent', user_id: null });
  });

  it('ohne E-Mail oder bei Versandfehler bleibt der Report „generiert“', async () => {
    const ohne = createFakeDb({ agencies: [{ id: 'k1', name: 'X', email: null }], reports: [{ id: 'r1', status: 'generiert' }] });
    expect(await versendeReport(ohne.client, report, { senden: vi.fn() as never })).toMatchObject({ ok: false });
    expect(ohne.tables.reports[0].status).toBe('generiert');

    const fehler = createFakeDb({ agencies: [{ id: 'k1', name: 'X', email: 'a@b.de' }], reports: [{ id: 'r1', status: 'generiert' }] });
    const senden = vi.fn(async () => ({ data: null, error: { message: 'down' } }));
    expect(await versendeReport(fehler.client, report, { senden: senden as never })).toMatchObject({ ok: false, error: 'E-Mail konnte nicht versendet werden' });
    expect(fehler.tables.reports[0].status).toBe('generiert');
  });
});
