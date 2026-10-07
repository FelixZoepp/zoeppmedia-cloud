import { describe, it, expect } from 'vitest';
import { baueFahrplan, schaetzeStart } from '../fahrplan';

const heute = '2026-10-07';
type R = { step_key: string; phase: 'zahlung' | 'onboarding' | 'setup' | 'continuity'; wer: 'kunde' | 'zoepp'; status: 'offen' | 'in_arbeit' | 'zur_pruefung' | 'erledigt' | 'nicht_noetig'; faellig_am: string | null };
const r = (step_key: string, phase: R['phase'], wer: R['wer'], status: R['status'], faellig_am: string | null = null): R => ({ step_key, phase, wer, status, faellig_am });

const zahlungFertig = [r('z_vertrag', 'zahlung', 'zoepp', 'erledigt'), r('z_rechnung_setup', 'zahlung', 'zoepp', 'erledigt'), r('z_zahlung_setup', 'zahlung', 'zoepp', 'erledigt')];

describe('Fahrplan', () => {
  it('Kunde muss noch etwas tun → Ball beim Kunden, überfällig gelb markiert', () => {
    const f = baueFahrplan({
      phase: 'onboarding',
      bausteine: ['indeed'],
      freigabenOffen: 0,
      heute,
      rows: [...zahlungFertig, r('o_cloud_login', 'onboarding', 'kunde', 'erledigt'), r('o_indeed', 'onboarding', 'kunde', 'offen', '2026-10-05'), r('o_zugaenge_geprueft', 'onboarding', 'zoepp', 'offen', '2026-10-06')],
    });
    expect(f.ball.wer).toBe('kunde');
    expect(f.ball.text).toContain('Indeed-Zugang gegeben');
    const onb = f.phasen.find((p) => p.key === 'onboarding')!;
    expect(onb.schritte.find((s) => s.key === 'o_indeed')).toMatchObject({ status: 'du', faellig: true });
    // Unser überfälliger Schritt: neutral, ohne Datum
    expect(onb.schritte.find((s) => s.key === 'o_zugaenge_geprueft')).toMatchObject({ status: 'in_arbeit', datum: null, faellig: false });
    // Indeed-Paket: keine Meta-Schritte, keine internen Schritte
    const keys = f.phasen.flatMap((p) => p.schritte.map((s) => s.key));
    expect(keys.some((k) => k.startsWith('o_meta_'))).toBe(false);
    expect(keys).not.toContain('z_rechnung_setup');
    expect(keys).not.toContain('o_transkript');
    expect(f.startDatum! >= heute).toBe(true);
  });

  it('nur wir sind dran → neutraler Hinweis mit geplantem Datum', () => {
    const f = baueFahrplan({
      phase: 'setup',
      bausteine: ['indeed', 'meta'],
      freigabenOffen: 0,
      heute,
      rows: [r('s_ideen', 'setup', 'zoepp', 'offen', '2026-10-05'), r('s_funnel', 'setup', 'zoepp', 'offen', '2026-10-09'), r('s_freigabe', 'setup', 'kunde', 'offen', '2026-10-10'), r('s_launch', 'setup', 'zoepp', 'offen', '2026-10-11')],
    });
    expect(f.ball.wer).toBe('zoepp');
    expect(f.ball.text).toMatch(/^Wir sind dran: Ad-Ideen und Skripte\. /);
    // Freigabe erst, wenn Ads bereitstehen
    expect(f.phasen.find((p) => p.key === 'setup')!.schritte.find((s) => s.key === 's_freigabe')!.status).toBe('geplant');
    expect(f.startDatum).toBe('2026-10-11');
    expect(f.phasen.find((p) => p.key === 'onboarding')!.status).toBe('fertig');
  });

  it('Freigabe offen → Ball beim Kunden', () => {
    const f = baueFahrplan({ phase: 'setup', bausteine: ['meta'], freigabenOffen: 2, heute, rows: [r('s_freigabe', 'setup', 'kunde', 'offen', '2026-10-10')] });
    expect(f.ball.wer).toBe('kunde');
  });

  it('Start nie in der Vergangenheit', () => {
    expect(schaetzeStart('setup', [r('s_launch', 'setup', 'zoepp', 'offen', '2026-10-01')], ['meta'], heute)).toBe('2026-10-09');
    expect(schaetzeStart('onboarding', [r('o_indeed', 'onboarding', 'kunde', 'offen', '2026-10-05')], ['indeed'], heute) > heute).toBe(true);
  });

  it('live → kein Fahrplan-Start, Fortschritt 100 %', () => {
    const f = baueFahrplan({ phase: 'continuity', bausteine: ['meta'], freigabenOffen: 0, heute, rows: [] });
    expect(f.live).toBe(true);
    expect(f.fortschritt).toBe(100);
  });
});
