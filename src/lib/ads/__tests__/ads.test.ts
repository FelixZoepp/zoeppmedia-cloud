import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotificationForAgency: vi.fn().mockResolvedValue(undefined),
}));

import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';
import { moveAd, customerDecision } from '../ads';
import { createNotification, createNotificationForAgency } from '@/lib/notifications/create';

const ad = (over: Record<string, unknown> = {}) => ({
  id: 'ad-1', agency_id: 'ag-1', titel: 'Reel: Tag im Außendienst', stage: 'bearbeitung', assignee_id: 'nils', ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('moveAd', () => {
  it('zur Freigabe → Kunde wird benachrichtigt, alter Kundenkommentar gelöscht, Verlauf geschrieben', async () => {
    const { client, tables } = createFakeDb({ ad_items: [ad({ kunden_kommentar: 'Logo größer' })] });
    await moveAd(client, 'ad-1', 'freigabe_kunde', { userId: 'nils' });

    expect(tables.ad_items[0]).toMatchObject({ stage: 'freigabe_kunde', kunden_kommentar: null });
    expect(tables.ad_item_log[0]).toMatchObject({ von_stage: 'bearbeitung', nach_stage: 'freigabe_kunde', user_id: 'nils' });
    expect(createNotificationForAgency).toHaveBeenCalledWith(expect.anything(), 'ag-1', expect.objectContaining({ push_url: '/deine-aufgaben' }));
  });

  it('live → Zeitpunkt wird gesetzt', async () => {
    const { client, tables } = createFakeDb({ ad_items: [ad({ stage: 'bereit' })] });
    await moveAd(client, 'ad-1', 'live', { now: new Date('2026-10-05T09:00:00Z') });
    expect(tables.ad_items[0].live_am).toBe('2026-10-05T09:00:00.000Z');
  });
});

describe('customerDecision', () => {
  it('Kunde gibt frei → Bereit, Nils bekommt "kann live"', async () => {
    const { client, tables } = createFakeDb({ ad_items: [ad({ stage: 'freigabe_kunde' })], agencies: [{ id: 'ag-1', name: 'B&C' }] });
    await customerDecision(client, 'ag-1', 'ad-1', 'freigeben', 'kunde-user');

    expect(tables.ad_items[0].stage).toBe('bereit');
    expect(tables.ad_items[0].freigegeben_am).toBeTruthy();
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ user_id: 'nils', title: 'B&C hat freigegeben – Ad kann live' }),
    );
  });

  it('Kunde wünscht Änderungen → zurück in die Bearbeitung mit Kommentar', async () => {
    const { client, tables } = createFakeDb({ ad_items: [ad({ stage: 'freigabe_kunde' })], agencies: [{ id: 'ag-1', name: 'B&C' }] });
    await customerDecision(client, 'ag-1', 'ad-1', 'aendern', 'kunde-user', 'Bitte unser Logo größer');

    expect(tables.ad_items[0]).toMatchObject({ stage: 'bearbeitung', kunden_kommentar: 'Bitte unser Logo größer' });
    expect(createNotification).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'B&C wünscht Änderungen' }));
  });

  it('Änderungswunsch ohne Kommentar wird abgelehnt', async () => {
    const { client } = createFakeDb({ ad_items: [ad({ stage: 'freigabe_kunde' })] });
    await expect(customerDecision(client, 'ag-1', 'ad-1', 'aendern', 'u', '  ')).rejects.toThrow('was geändert werden soll');
  });

  it('fremde Agentur oder falsche Stage → abgelehnt', async () => {
    const { client } = createFakeDb({ ad_items: [ad({ stage: 'freigabe_kunde' }), ad({ id: 'ad-2', stage: 'idee' })] });
    await expect(customerDecision(client, 'ag-2', 'ad-1', 'freigeben', 'u')).rejects.toThrow('nicht gefunden');
    await expect(customerDecision(client, 'ag-1', 'ad-2', 'freigeben', 'u')).rejects.toThrow('wartet gerade nicht');
  });
});
