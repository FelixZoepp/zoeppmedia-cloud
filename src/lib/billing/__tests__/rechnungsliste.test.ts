import { describe, it, expect } from 'vitest';
import { faelligImMonat, rechnungenFuerMonat, passtZu, markiereGeschrieben, type Vertragsdaten } from '../rechnungsliste';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';

const kunde = (over: Partial<Vertragsdaten> = {}): Vertragsdaten => ({
  id: 'ag-1', name: 'CGMS GmbH', vertragsstart: '2026-09-14', mrr: 1500, setup_betrag: null,
  lex_contact_id: 'lex-1', fulfillment_phase: 'continuity', ...over,
});

describe('Rechnungstag = Vertragsstart-Tag', () => {
  it('Start am 14. → jeden 14.', () => {
    expect(faelligImMonat('2026-09-14', '2026-10')).toBe('2026-10-14');
  });
  it('Start am 31. → im Februar am letzten Tag', () => {
    expect(faelligImMonat('2026-01-31', '2027-02')).toBe('2027-02-28');
  });
});

describe('rechnungenFuerMonat', () => {
  it('Retainer ab dem Startmonat, geschriebene werden erkannt', () => {
    const z = rechnungenFuerMonat([kunde()], [{ agency_id: 'ag-1', typ: 'retainer', periode: '2026-10', geschrieben_am: '2026-10-14T09:00:00Z', rechnungsnummer: 'RE0601' }], '2026-10');
    expect(z).toEqual([expect.objectContaining({ typ: 'retainer', faellig_am: '2026-10-14', betrag_netto: 1500, rechnungsnummer: 'RE0601' })]);
    expect(rechnungenFuerMonat([kunde()], [], '2026-08')).toEqual([]);
  });

  it('Einrichtungsgebühr bleibt in der Liste, bis sie geschrieben ist', () => {
    const k = kunde({ setup_betrag: 2500, mrr: null });
    expect(rechnungenFuerMonat([k], [], '2026-11')).toEqual([expect.objectContaining({ typ: 'setup', betrag_netto: 2500 })]);
    expect(rechnungenFuerMonat([k], [{ agency_id: 'ag-1', typ: 'setup', periode: 'setup', geschrieben_am: '2026-09-14T09:00:00Z', rechnungsnummer: 'RE1' }], '2026-11')).toEqual([]);
  });

  it('Kunden im Offboarding bekommen keine Rechnung mehr', () => {
    expect(rechnungenFuerMonat([kunde({ fulfillment_phase: 'offboarding' })], [], '2026-10')).toEqual([]);
  });
});

describe('Lexoffice-Abgleich', () => {
  it('erkennt den Kunden am markanten Namen', () => {
    expect(passtZu('CGMS GmbH', 'CGMS GmbH')).toBe(true);
    expect(passtZu('Orkanor GmbH', 'Orkanor GmbH')).toBe(true);
    expect(passtZu('Schweikert Immo Invest', 'Schweikert Immo Invest GmbH ')).toBe(true);
    expect(passtZu('Sales Fokus', 'Hoffmann Solutions')).toBe(false);
  });
});

describe('markiereGeschrieben', () => {
  it('Einrichtungsgebühr geschrieben → Fulfillment-Schritt "Rechnung geschrieben" erledigt', async () => {
    const { client, tables } = createFakeDb({
      client_steps: [{ id: 's1', agency_id: 'ag-1', step_key: 'z_rechnung_setup', phase: 'zahlung', wer: 'zoepp', status: 'offen' }],
      agencies: [{ id: 'ag-1', fulfillment_phase: 'zahlung' }],
    });
    await markiereGeschrieben(client, { agency_id: 'ag-1', typ: 'setup', periode: 'setup', faellig_am: '2026-10-03', betrag_netto: 2500 }, 'RE0610', 'petra');
    expect(tables.invoice_due[0]).toMatchObject({ typ: 'setup', rechnungsnummer: 'RE0610', geschrieben_von: 'petra' });
    expect(tables.client_steps[0].status).toBe('erledigt');
  });
});
