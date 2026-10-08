import { describe, expect, it } from 'vitest';
import { faelligeErinnerung, MAX_UMFRAGE_ERINNERUNGEN } from '../whatsapp';

const jetzt = new Date('2026-10-20T08:00:00Z');
const basis = { completed_at: null, wa_gesendet_am: '2026-10-17T08:00:00Z', erinnert_am: null, erinnerungen: 0, sent_at: '2026-10-17T08:00:00Z' };

describe('faelligeErinnerung (2-Wochen-Check)', () => {
  it('erinnert frühestens 2 Tage nach dem Versand', () => {
    expect(faelligeErinnerung(basis, jetzt)).toBe(true);
    expect(faelligeErinnerung({ ...basis, wa_gesendet_am: '2026-10-19T08:00:00Z', sent_at: '2026-10-19T08:00:00Z' }, jetzt)).toBe(false);
  });
  it('nicht mehr, wenn beantwortet, schon 2× erinnert oder älter als 12 Tage', () => {
    expect(faelligeErinnerung({ ...basis, completed_at: '2026-10-18T08:00:00Z' }, jetzt)).toBe(false);
    expect(faelligeErinnerung({ ...basis, erinnerungen: MAX_UMFRAGE_ERINNERUNGEN }, jetzt)).toBe(false);
    expect(faelligeErinnerung({ ...basis, wa_gesendet_am: '2026-10-05T08:00:00Z', sent_at: '2026-10-05T08:00:00Z' }, jetzt)).toBe(false);
  });
  it('zweite Erinnerung 2 Tage nach der ersten', () => {
    expect(faelligeErinnerung({ ...basis, erinnerungen: 1, erinnert_am: '2026-10-19T08:00:00Z' }, jetzt)).toBe(false);
    expect(faelligeErinnerung({ ...basis, erinnerungen: 1, erinnert_am: '2026-10-18T08:00:00Z' }, jetzt)).toBe(true);
  });
});
