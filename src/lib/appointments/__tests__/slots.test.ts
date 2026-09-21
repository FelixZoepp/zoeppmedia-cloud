import { describe, it, expect } from 'vitest';
import { computeSlots, type SlotInput } from '../slots';

describe('computeSlots', () => {
  const baseInput: SlotInput = {
    rules: [
      { weekday: 1, start_time: '09:00:00', end_time: '12:00:00' }, // Montag
      { weekday: 3, start_time: '14:00:00', end_time: '17:00:00' }, // Mittwoch
    ],
    bookedSlots: [],
    from: new Date('2026-10-05T08:00:00Z'), // Montag
    days: 14,
    durationMinutes: 30,
    bufferMinutes: 15,
    timezone: 'Europe/Berlin',
  };

  it('erzeugt Slots nur an konfigurierten Wochentagen', () => {
    const slots = computeSlots(baseInput);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Europe/Berlin' })
        .format(slot.start);
      expect(['Mon', 'Wed']).toContain(day);
    }
  });

  it('Slot-Dauer entspricht durationMinutes', () => {
    const slots = computeSlots(baseInput);
    for (const slot of slots) {
      expect(slot.end.getTime() - slot.start.getTime()).toBe(30 * 60_000);
    }
  });

  it('filtert Slots in der Vergangenheit und < 2h Vorlauf', () => {
    const now = new Date();
    const slots = computeSlots({ ...baseInput, from: now, days: 14 });
    const cutoff = new Date(now.getTime() + 2 * 60 * 60_000);
    for (const slot of slots) {
      expect(slot.start.getTime()).toBeGreaterThanOrEqual(cutoff.getTime());
    }
  });

  it('belegte Slots + Puffer werden ausgeschlossen', () => {
    // Montag 10:00-10:30 CET gebucht -> 09:15-10:45 CET blockiert (30min Slot + 15min Puffer beidseitig)
    const input: SlotInput = {
      ...baseInput,
      bookedSlots: [
        { starts_at: '2026-10-05T08:00:00Z', ends_at: '2026-10-05T08:30:00Z' }, // 10:00-10:30 CEST
      ],
    };
    const slots = computeSlots(input);
    for (const slot of slots) {
      // Kein Slot darf in den Puffer-Bereich fallen
      const bookedStart = new Date('2026-10-05T08:00:00Z').getTime();
      const bookedEnd = new Date('2026-10-05T08:30:00Z').getTime();
      const bufferMs = 15 * 60_000;
      const overlaps =
        slot.start.getTime() < bookedEnd + bufferMs &&
        slot.end.getTime() > bookedStart - bufferMs;
      expect(overlaps).toBe(false);
    }
  });

  it('leere Regeln = keine Slots', () => {
    const slots = computeSlots({ ...baseInput, rules: [] });
    expect(slots).toEqual([]);
  });

  it('Slots überschreiten nicht das Zeitfenster-Ende', () => {
    // Regel bis 12:00, durationMinutes=30 -> letzter Slot beginnt spätestens 11:30
    const slots = computeSlots({ ...baseInput, days: 1 });
    for (const slot of slots) {
      const hour = parseInt(
        new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Berlin' })
          .formatToParts(slot.end).find(p => p.type === 'hour')?.value || '0',
        10,
      );
      const minute = parseInt(
        new Intl.DateTimeFormat('en-US', { minute: 'numeric', timeZone: 'Europe/Berlin' })
          .formatToParts(slot.end).find(p => p.type === 'minute')?.value || '0',
        10,
      );
      // slot.end darf max 12:00 Ortszeit sein (Montag-Regel)
      expect(hour * 60 + minute).toBeLessThanOrEqual(12 * 60);
    }
  });

  it('DST-Übergang: Slots bleiben in Ortszeit stabil', () => {
    // Sommerzeit -> Winterzeit 2026: 25.10.2026 um 03:00 CEST -> 02:00 CET
    const dstInput: SlotInput = {
      ...baseInput,
      from: new Date('2026-10-24T06:00:00Z'), // Samstag vor DST-Wechsel
      rules: [
        { weekday: 1, start_time: '09:00:00', end_time: '12:00:00' },
      ],
      days: 7,
    };
    const slots = computeSlots(dstInput);
    // Alle Slots am Montag 26.10. müssen um 09:00 CET beginnen (nicht 08:00 oder 10:00)
    for (const slot of slots) {
      const hourStr = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Berlin' })
        .formatToParts(slot.start).find(p => p.type === 'hour')?.value;
      const hour = parseInt(hourStr || '0', 10);
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThan(12);
    }
  });
});
