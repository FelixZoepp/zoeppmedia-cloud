import { describe, expect, it } from 'vitest';
import { gueltigeZeit, rueckrufAufgabe, rueckrufFaellig, rueckrufNotiz, rueckrufZeit, rueckrufZeitpunkt, zerlegeRueckruf } from '../rueckruf';

describe('Rückruf mit Uhrzeit (Anruf-Modus wie Close)', () => {
  it('zerlegt datetime-local und prüft die Uhrzeit', () => {
    expect(zerlegeRueckruf('2026-10-16T14:30')).toEqual({ datum: '2026-10-16', zeit: '14:30' });
    expect(zerlegeRueckruf('2026-10-16T14:30:00')).toEqual({ datum: '2026-10-16', zeit: '14:30' });
    expect(zerlegeRueckruf('2026-10-16')).toBeNull();
    expect(zerlegeRueckruf('')).toBeNull();
    expect(gueltigeZeit('24:00')).toBeNull();
    expect(gueltigeZeit(1430)).toBeNull();
  });

  it('Uhrzeit als Notiz-Vorsatz hin und zurück', () => {
    expect(rueckrufNotiz('14:30', ' Nach der Arbeit ')).toBe('Rückruf um 14:30 Uhr · Nach der Arbeit');
    expect(rueckrufNotiz('14:30', null)).toBe('Rückruf um 14:30 Uhr');
    expect(rueckrufNotiz(null, 'nur Notiz')).toBe('nur Notiz');
    expect(rueckrufNotiz(null, '  ')).toBeNull();
    expect(rueckrufZeit('Rückruf um 14:30 Uhr · Nach der Arbeit')).toBe('14:30');
    expect(rueckrufZeit('Rückruf um 9 Uhr')).toBeNull();
    expect(rueckrufZeit(null)).toBeNull();
  });

  it('Zeitpunkt in Berliner Zeit (Sommer/Winter)', () => {
    expect(rueckrufZeitpunkt('2026-10-16', '14:30')?.toISOString()).toBe('2026-10-16T12:30:00.000Z');
    expect(rueckrufZeitpunkt('2026-12-01', '09:00')?.toISOString()).toBe('2026-12-01T08:00:00.000Z');
    expect(rueckrufZeitpunkt('kaputt', '09:00')).toBeNull();
  });

  it('bis zur Uhrzeit ausgeblendet, danach fällig; ohne Uhrzeit tagesgenau wie bisher', () => {
    const cb = { next_contact_date: '2026-10-16', notes: 'Rückruf um 14:30 Uhr · Nach der Arbeit' };
    expect(rueckrufFaellig(cb, new Date('2026-10-16T12:29:00Z'))).toBe(false);
    expect(rueckrufFaellig(cb, new Date('2026-10-16T12:30:00Z'))).toBe(true);
    expect(rueckrufFaellig(cb, new Date('2026-10-17T06:00:00Z'))).toBe(true);
    expect(rueckrufFaellig({ next_contact_date: '2026-10-16', notes: 'Ab 17 Uhr' }, new Date('2026-10-15T22:30:00Z'))).toBe(true);
    expect(rueckrufFaellig({ next_contact_date: null, notes: null }, new Date('2026-10-16T00:00:00Z'))).toBe(true);
  });

  it('interne Aufgabe am Wunschtag mit der Anruf-Notiz', () => {
    expect(rueckrufAufgabe({ name: 'Max Muster', agencyId: 'a1', datum: '2026-10-16', zeit: '14:30', notiz: ' Nach der Arbeit ' })).toEqual({
      title: 'Rückruf 14:30 Uhr — Max Muster',
      description: 'Rückruf gewünscht um 14:30 Uhr. Notiz aus dem Anruf: Nach der Arbeit',
      agency_id: 'a1',
      status: 'todo',
      priority: 'high',
      due_date: '2026-10-16',
      created_by: null,
    });
    expect(rueckrufAufgabe({ name: 'Max', agencyId: 'a1', datum: '2026-10-16', zeit: null, notiz: null }).description).toBe('Rückruf gewünscht.');
  });
});
