import { describe, expect, it } from 'vitest';
import { entscheide } from '../reaktivierung';

const jetzt = new Date('2026-10-09T08:00:00Z');

describe('entscheide (Reaktivierung Unqualifizierte)', () => {
  it('ohne Sperre, vor über 3 Monaten eingestuft → sofort zurück in den Leadpool', () => {
    expect(entscheide(null, '2026-06-01T10:00:00Z', jetzt)).toEqual({ aktion: 'reaktivieren' });
  });
  it('ohne Sperre, kürzlich eingestuft → Sperre bis Einstufung + 3 Monate', () => {
    expect(entscheide(null, '2026-09-20T10:00:00Z', jetzt)).toEqual({ aktion: 'sperren', bis: '2026-12-20T10:00:00.000Z' });
  });
  it('Sperre abgelaufen → reaktivieren, Sperre läuft noch → warten', () => {
    expect(entscheide('2026-10-08T00:00:00Z', '2026-07-08T00:00:00Z', jetzt)).toEqual({ aktion: 'reaktivieren' });
    expect(entscheide('2026-12-01T00:00:00Z', '2026-09-01T00:00:00Z', jetzt)).toEqual({ aktion: 'warten' });
  });
  it('alte, abgelaufene Sperre vor der Einstufung zählt nicht (Fall Klöden)', () => {
    // Rückruf-Sperre bis 12.10., am 15.10. unqualifiziert → bis 15.01. gesperrt, nicht am 16.10. zurück
    expect(entscheide('2026-10-12T10:00:00Z', '2026-10-15T09:00:00Z', new Date('2026-10-16T06:00:00Z'))).toEqual({ aktion: 'sperren', bis: '2027-01-15T09:00:00.000Z' });
  });
});
