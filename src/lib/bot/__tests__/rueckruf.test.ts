import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/llm-client', () => ({ llmJsonCall: vi.fn(), DIALOG_MODEL: 'test' }));

import { berlinIso, fensterText, naechsterAnrufSlot, pruefeFenster } from '../rueckruf';

describe('Rückruf-Fenster', () => {
  const jetzt = new Date('2026-10-12T08:05:00Z'); // Mo 10:05 Berlin
  it('nächster Slot in der Arbeitszeit, frühestens 30 Min.', () => {
    expect(naechsterAnrufSlot(jetzt).toISOString()).toBe('2026-10-12T08:45:00.000Z');
    expect(naechsterAnrufSlot(new Date('2026-10-12T17:30:00Z')).toISOString()).toBe('2026-10-13T07:00:00.000Z'); // 19:30 → Di 9:00
    expect(naechsterAnrufSlot(new Date('2026-10-17T13:00:00Z')).toISOString()).toBe('2026-10-19T07:00:00.000Z'); // Sa 15:00 → Mo 9:00
  });
  it('vergangene oder unklare Zeiten → nächster Slot, Ende nach Start', () => {
    const f = pruefeFenster(new Date('2026-10-12T06:00:00Z'), null, jetzt);
    expect(f.von.toISOString()).toBe('2026-10-12T08:45:00.000Z');
    expect(f.bis.getTime() - f.von.getTime()).toBe(3600_000);
    const g = pruefeFenster(new Date('2026-10-13T08:00:00Z'), new Date('2026-10-13T09:00:00Z'), jetzt);
    expect(g.von.toISOString()).toBe('2026-10-13T08:00:00.000Z');
  });
  it('lesbarer Text', () => {
    expect(fensterText(new Date('2026-10-13T08:00:00Z'), new Date('2026-10-13T09:00:00Z'), jetzt)).toBe('morgen zwischen 10:00 und 11:00 Uhr');
    expect(fensterText(new Date('2026-10-12T12:00:00Z'), new Date('2026-10-12T13:00:00Z'), jetzt)).toBe('heute zwischen 14:00 und 15:00 Uhr');
  });
});

describe('Rückruf – Zeitzone und Arbeitszeit', () => {
  it('ISO ohne Zeitzone gilt als Berliner Zeit', () => {
    expect(berlinIso('2026-10-13T10:00:00').toISOString()).toBe('2026-10-13T08:00:00.000Z'); // Sommerzeit
    expect(berlinIso('2026-11-13T10:00:00').toISOString()).toBe('2026-11-13T09:00:00.000Z'); // Winterzeit
    expect(berlinIso('2026-10-13T10:00:00+02:00').toISOString()).toBe('2026-10-13T08:00:00.000Z');
  });
  it('nachts 3 Uhr → nächster Slot in der Arbeitszeit', () => {
    const jetzt = new Date('2026-10-12T08:05:00Z');
    const f = pruefeFenster(new Date('2026-10-13T01:00:00Z'), null, jetzt); // Di 3:00
    expect(f.von.toISOString()).toBe('2026-10-13T07:00:00.000Z'); // Di 9:00
  });
});
