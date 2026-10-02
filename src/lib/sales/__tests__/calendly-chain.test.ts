import { describe, it, expect } from 'vitest';
import {
  extractInviteePhone,
  normalizeToE164,
  computeConfirmationTime,
  computeReminderTime,
} from '../calendly-chain';

describe('extractInviteePhone', () => {
  it('nimmt die SMS-Reminder-Nummer zuerst', () => {
    expect(
      extractInviteePhone(
        { text_reminder_number: '+49 151 111', questions_and_answers: [{ question: 'Telefon', answer: '0170 222' }] },
        { type: 'outbound_call', location: '+49 177 333' },
      ),
    ).toBe('+49 151 111');
  });

  it('liest die Nummer aus dem Ort bei "Ich rufe an" (Analysegespräch)', () => {
    expect(extractInviteePhone({}, { type: 'outbound_call', location: '+49 177 1908503' })).toBe('+49 177 1908503');
  });

  it('ignoriert den Ort bei Zoom', () => {
    expect(extractInviteePhone({}, { type: 'zoom_conference', location: 'https://us06web.zoom.us/j/1' })).toBeNull();
  });

  it('erkennt eine Frage nach der WhatsApp-Nummer (Beratungsgespräch)', () => {
    expect(
      extractInviteePhone(
        { questions_and_answers: [{ question: 'Handynummer (für WhatsApp-Erinnerungen)', answer: '0151 2345678' }] },
        { type: 'zoom_conference', location: 'https://zoom.us/j/1' },
      ),
    ).toBe('0151 2345678');
    expect(
      extractInviteePhone({ questions_and_answers: [{ question: 'Deine WhatsApp', answer: '0151 1' }] }, null),
    ).toBe('0151 1');
  });

  it('gibt null zurück, wenn nirgends eine Nummer steht', () => {
    expect(extractInviteePhone({ questions_and_answers: [{ question: 'Unternehmensname', answer: 'ACME' }] }, null)).toBeNull();
  });
});

describe('normalizeToE164', () => {
  it.each([
    ['+49 177 1908503', '+491771908503'],
    ['0151 2345678', '+491512345678'],
    ['0043 664 88265359', '+4366488265359'],
    ['+43 664 88265359', '+4366488265359'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeToE164(raw)).toBe(expected);
  });

  it('verwirft zu kurze oder leere Eingaben', () => {
    expect(normalizeToE164('123')).toBeNull();
    expect(normalizeToE164('')).toBeNull();
    expect(normalizeToE164(null)).toBeNull();
  });
});

describe('Zeitpunkte der Kette', () => {
  const now = new Date('2026-10-02T10:00:00Z');

  it('Bestätigung 24h vorher, wenn genug Vorlauf', () => {
    const start = new Date('2026-10-05T16:00:00Z');
    expect(computeConfirmationTime(start, now)?.toISOString()).toBe('2026-10-04T16:00:00.000Z');
  });

  it('Bestätigung fällt auf 3h vorher zurück bei kurzfristiger Buchung', () => {
    const start = new Date('2026-10-02T20:00:00Z');
    expect(computeConfirmationTime(start, now)?.toISOString()).toBe('2026-10-02T17:00:00.000Z');
  });

  it('keine Bestätigung, wenn der Termin zu nah ist', () => {
    expect(computeConfirmationTime(new Date('2026-10-02T12:00:00Z'), now)).toBeNull();
  });

  it('Reminder: Analysegespräch 15 min, Beratung 1h vorher', () => {
    const start = new Date('2026-10-05T16:00:00Z');
    expect(computeReminderTime('setting', start, now)?.toISOString()).toBe('2026-10-05T15:45:00.000Z');
    expect(computeReminderTime('beratung', start, now)?.toISOString()).toBe('2026-10-05T15:00:00.000Z');
  });
});
