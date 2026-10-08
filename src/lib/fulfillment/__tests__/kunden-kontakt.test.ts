import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from './fake-db';

const close = {
  findCloseLeadIdByEmail: vi.fn(),
  findCloseLeadIdByName: vi.fn(),
  getCloseLeadContacts: vi.fn(),
  ladeCloseLead: vi.fn(),
};
vi.mock('@/lib/sales/close', () => close);

import { ordneKundeZu, verknuepfeKundenKontakte } from '../kunden-kontakt';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';

const K1 = 'kunde-1';
const K2 = 'kunde-2';

function db(candidates: Record<string, unknown>[], users: Record<string, unknown>[] = []) {
  return createFakeDb({
    agencies: [
      { id: K1, name: 'Alpha GmbH', email: 'info@alpha.de', phone: null, contact_name: 'Anna Alpha', fulfillment_phase: 'betreuung' },
      { id: K2, name: 'Beta GmbH', email: null, phone: '+4930999888', contact_name: null, fulfillment_phase: 'betreuung' },
    ],
    users,
    candidates,
  });
}

beforeEach(() => {
  Object.values(close).forEach((f) => f.mockReset());
  close.findCloseLeadIdByEmail.mockResolvedValue(null);
  close.findCloseLeadIdByName.mockResolvedValue(null);
  close.getCloseLeadContacts.mockResolvedValue(null);
  close.ladeCloseLead.mockResolvedValue(null);
});

describe('Kunden-Zuordnung in der Sales-Inbox', () => {
  it('ordneKundeZu: Treffer über Telefon eines Kunden-Mitarbeiters (nicht nur Inhaber)', async () => {
    const d = db(
      [{ id: 'c-1', agency_id: SALES_AGENCY_ID, phone_e164: '+4917612345678', kunde_agency_id: null, kunde_manuell: false }],
      [{ id: 'u-1', agency_id: K1, role: 'agency_viewer', phone: '0176 1234 5678', email: null }],
    );
    expect(await ordneKundeZu(d.client, 'c-1', '+4917612345678')).toBe(K1);
    expect(d.tables.candidates[0].kunde_agency_id).toBe(K1);
  });

  it('ordneKundeZu: von Hand markierte Kontakte bleiben unverändert', async () => {
    const d = db([{ id: 'c-1', agency_id: SALES_AGENCY_ID, phone_e164: '+4930999888', kunde_agency_id: null, kunde_manuell: true }]);
    await ordneKundeZu(d.client, 'c-1', '+4930999888');
    expect(d.tables.candidates[0].kunde_agency_id).toBeNull();
  });

  it('verknuepfeKundenKontakte: Agentur-Telefon, Mitarbeiter-Mail und Close-Kontakte', async () => {
    close.findCloseLeadIdByEmail.mockImplementation(async (m: string) => (m === 'info@alpha.de' ? 'lead_alpha' : null));
    close.getCloseLeadContacts.mockImplementation(async (id: string) =>
      id === 'lead_alpha' ? { leadName: 'Alpha', contactName: 'Anna', phones: ['+49 151 5555 6666'], emails: [] } : null,
    );
    const d = db(
      [
        { id: 'c-tel', agency_id: SALES_AGENCY_ID, phone_e164: '+4930999888', email: null, kunde_agency_id: null, kunde_manuell: false, deleted_at: null },
        { id: 'c-mail', agency_id: SALES_AGENCY_ID, phone_e164: null, email: 'Chef@Alpha.de', kunde_agency_id: null, kunde_manuell: false, deleted_at: null },
        { id: 'c-close', agency_id: SALES_AGENCY_ID, phone_e164: '+4915155556666', email: null, kunde_agency_id: null, kunde_manuell: false, deleted_at: null },
        { id: 'c-lead', agency_id: SALES_AGENCY_ID, phone_e164: '+4917000000000', email: null, kunde_agency_id: null, kunde_manuell: false, deleted_at: null },
        { id: 'c-manuell', agency_id: SALES_AGENCY_ID, phone_e164: '+4930999888', email: null, kunde_agency_id: null, kunde_manuell: true, deleted_at: null },
      ],
      [{ id: 'u-1', agency_id: K1, role: 'agency_member', phone: null, email: 'chef@alpha.de' }],
    );
    await verknuepfeKundenKontakte(d.client, { mitClose: true });
    const k = Object.fromEntries(d.tables.candidates.map((c) => [c.id, c.kunde_agency_id]));
    expect(k).toEqual({ 'c-tel': K2, 'c-mail': K1, 'c-close': K1, 'c-lead': null, 'c-manuell': null });
  });
});
