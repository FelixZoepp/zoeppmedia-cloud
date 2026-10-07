import { describe, it, expect } from 'vitest';
import { erinnerungsMail, faelligeErinnerungen, type OffeneKundenAufgabe } from '../kunden-erinnerung';

const jetzt = new Date('2026-10-07T08:00:00Z');
const heute = '2026-10-07';
const a = (p: Partial<OffeneKundenAufgabe>): OffeneKundenAufgabe => ({
  id: Math.random().toString(),
  agency_id: 'k1',
  step_key: 'o_indeed',
  status: 'offen',
  faellig_am: '2026-10-05',
  kunde_erinnert_am: null,
  kunde_erinnerungen: 0,
  ...p,
});

describe('Kunden-Erinnerungen', () => {
  it('nur abgelaufene, nicht optionale Kunden-Aufgaben', () => {
    const m = faelligeErinnerungen(
      [a({}), a({ step_key: 'o_whatsapp' }), a({ step_key: 's_freigabe' }), a({ step_key: 'o_bilder', faellig_am: heute }), a({ step_key: 'o_kickoff' })],
      heute,
      jetzt,
    );
    expect(m.get('k1')!.map((x) => x.step_key)).toEqual(['o_indeed']);
  });

  it('höchstens alle 2 Tage, max. 3-mal', () => {
    expect(faelligeErinnerungen([a({ kunde_erinnert_am: '2026-10-06T08:00:00Z', kunde_erinnerungen: 1 })], heute, jetzt).size).toBe(0);
    expect(faelligeErinnerungen([a({ kunde_erinnert_am: '2026-10-05T08:00:00Z', kunde_erinnerungen: 1 })], heute, jetzt).size).toBe(1);
    expect(faelligeErinnerungen([a({ kunde_erinnert_am: '2026-10-01T08:00:00Z', kunde_erinnerungen: 3 })], heute, jetzt).size).toBe(0);
  });

  it('Mail: freundlich, Aufgaben escaped', () => {
    const m = erinnerungsMail('Max Muster', ['Indeed-Zugang gegeben', '<b>x</b>'], 'https://x/deine-aufgaben');
    expect(m.betreff).toBe('Kurz noch 2 Dinge für deinen Kampagnenstart');
    expect(m.html).toContain('Hallo Max,');
    expect(m.html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
