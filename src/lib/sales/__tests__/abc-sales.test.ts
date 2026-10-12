import { describe, expect, it } from 'vitest';
import { pruefZeit } from '../speed-to-lead';
import { tageOhneBewegung } from '../stehende-deals';
import { istLeadTermin } from '../termin-check';
import { istVerloren } from '../close-aufraeumen';

describe('Speed-to-Lead', () => {
  it('prüft 30 Min. nach der Eintragung, nachts erst um 8:30 Uhr', () => {
    const tag = new Date('2026-10-12T08:00:00Z'); // 10:00 Berlin
    expect(pruefZeit(tag, tag).toISOString()).toBe('2026-10-12T08:30:00.000Z');
    const nacht = new Date('2026-10-12T21:00:00Z'); // 23:00 Berlin
    expect(pruefZeit(nacht, nacht).toISOString()).toBe('2026-10-13T06:30:00.000Z');
  });
});

describe('Stehende Deals', () => {
  it('zählt volle Tage', () => {
    expect(tageOhneBewegung('2026-10-01T10:00:00Z', new Date('2026-10-12T09:00:00Z'))).toBe(10);
  });
});

describe('Termin-Check', () => {
  const jetzt = new Date('2026-10-12T10:00:00Z');
  it('nur echte, künftige Lead-Termine', () => {
    expect(istLeadTermin({ termin: '2026-10-14T09:00:00Z', closingTerminiert: true }, jetzt)).toBe(true);
    expect(istLeadTermin({ termin: '2026-10-14T09:00:00Z', oppStatus: 'cc2' }, jetzt)).toBe(true);
    expect(istLeadTermin({ termin: '2026-10-14T09:00:00Z' }, jetzt)).toBe(false); // Rückruf
    expect(istLeadTermin({ termin: '2026-10-10T09:00:00Z', settingOpportunity: true }, jetzt)).toBe(false);
  });
});

describe('Verlustgrund', () => {
  it('erkennt den Wechsel auf verloren', () => {
    expect(istVerloren({ object_type: 'opportunity', action: 'updated', changed_fields: ['status_id', 'status_type'], data: { status_type: 'lost' }, previous_data: { status_type: 'active' } })).toBe(true);
    expect(istVerloren({ object_type: 'opportunity', action: 'updated', changed_fields: ['value'], data: { status_type: 'lost' }, previous_data: { status_type: 'lost' } })).toBe(false);
  });
});
