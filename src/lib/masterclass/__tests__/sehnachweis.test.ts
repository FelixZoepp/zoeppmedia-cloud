import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { baueSehnachweis, mindestSekunden, pruefeSehnachweis } from '../sehnachweis';

describe('Sehnachweis', () => {
  const alt = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-geheim';
  });
  afterEach(() => {
    process.env.CRON_SECRET = alt;
  });

  it('gibt den Öffnungszeitpunkt zurück, wenn Lektion und Nutzer passen', () => {
    const t = baueSehnachweis('les-1', 'user-1', 1_800_000_000_000)!;
    expect(pruefeSehnachweis(t, 'les-1', 'user-1', 1_800_000_600_000)).toBe(1_800_000_000_000);
  });

  it('lehnt fremde Lektion, fremden Nutzer und veränderte Zeit ab', () => {
    const t = baueSehnachweis('les-1', 'user-1', 1_800_000_000_000)!;
    expect(pruefeSehnachweis(t, 'les-2', 'user-1', 1_800_000_600_000)).toBeNull();
    expect(pruefeSehnachweis(t, 'les-1', 'user-2', 1_800_000_600_000)).toBeNull();
    const [l, u, , sig] = t.split('.');
    expect(pruefeSehnachweis(`${l}.${u}.1700000000000.${sig}`, 'les-1', 'user-1', 1_800_000_600_000)).toBeNull();
    expect(pruefeSehnachweis(undefined, 'les-1', 'user-1')).toBeNull();
  });

  it('Mindestzeit: Dauer der Lektion vor Player-Dauer, mit Toleranz', () => {
    expect(mindestSekunden(10, 30)).toBe(510);
    expect(mindestSekunden(null, 600)).toBe(510);
    expect(mindestSekunden(null, undefined)).toBe(0);
    expect(mindestSekunden(null, 99_999)).toBe(Math.floor(6 * 3600 * 0.85));
  });
});
