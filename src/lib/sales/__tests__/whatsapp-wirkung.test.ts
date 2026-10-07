import { describe, it, expect } from 'vitest';
import { berechneWirkung, erinnerungsWirkung } from '../whatsapp-wirkung';

const t = (h: number) => new Date(Date.parse('2026-10-01T10:00:00Z') + h * 3600e3).toISOString();

describe('WhatsApp-Wirkung', () => {
  it('Quoten je Nachrichtenart', () => {
    const z = berechneWirkung({
      ausgehend: [
        { kontakt: 'a', conversation: 'ca', preset: 'fu_1', status: 'read', am: t(0) },
        { kontakt: 'b', conversation: 'cb', preset: 'fu_2', status: 'delivered', am: t(0) },
        { kontakt: 'c', conversation: 'cc', preset: 'fu_1', status: 'failed', am: t(0) },
        { kontakt: 'a', conversation: 'ca', preset: 'setting_buchung_v2', status: 'read', am: t(0) },
      ],
      eingehend: [{ conversation: 'ca', am: t(5) }, { conversation: 'cb', am: t(60) }],
      klicks: [{ kontakt: 'a', source: 'fu_1', am: t(1) }],
      buchungen: [{ kontakt: 'a', am: t(2) }],
    });
    const fu = z.find((x) => x.key === 'followup')!;
    expect(fu).toMatchObject({ gesendet: 3, fehlgeschlagen: 1, gelesen: 1, antworten: 1, klicks: 1, termine: 1, leseQuote: 50, antwortQuote: 50, terminQuote: 50 });
    expect(z.find((x) => x.key === 'buchung')!.terminQuote).toBeNull();
  });

  it('Kunden-Erinnerung: erledigt binnen 3 Tagen', () => {
    expect(
      erinnerungsWirkung([
        { kunde_erinnert_am: t(0), erledigt_am: t(30) },
        { kunde_erinnert_am: t(0), erledigt_am: t(100) },
        { kunde_erinnert_am: t(0), erledigt_am: null },
      ]),
    ).toEqual({ erinnert: 3, erledigt3: 1, quote: 33 });
  });
});
