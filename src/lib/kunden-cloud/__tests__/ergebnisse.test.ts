import { describe, it, expect } from 'vitest';
import { berechneErgebnisse } from '../ergebnisse';

const jetzt = new Date('2026-10-06T12:00:00Z');
const tage = (n: number) => new Date(jetzt.getTime() - n * 864e5).toISOString();
const ag = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id.toUpperCase(), settings: null, fulfillment_phase: 'continuity', pausiert_grund: null, csm_user_id: null, ...extra,
});
const kand = (agency_id: string, alter: number, extra: Record<string, unknown> = {}) => ({
  agency_id, created_at: tage(alter), first_contact_at: null, ttfc_seconds: null, eingestellt_am: null, ...extra,
});

describe('berechneErgebnisse', () => {
  const r = berechneErgebnisse(
    [ag('a'), ag('b'), ag('c', { pausiert_grund: 'Urlaub' })],
    [
      ...Array.from({ length: 6 }, (_, i) => kand('a', i + 1, i < 5 ? { first_contact_at: tage(i), ttfc_seconds: 600 } : {})),
      kand('a', 20, { eingestellt_am: tage(2) }),
      kand('a', 40),
      ...Array.from({ length: 10 }, () => kand('b', 10)),
    ],
    [
      { agency_id: 'a', result: 'termin_vereinbart', created_at: tage(2) },
      { agency_id: 'a', result: 'nicht_erreicht', created_at: tage(3) },
    ],
    [
      { agency_id: 'a', status: 'erschienen', datum: tage(1) },
      { agency_id: 'a', status: 'abgesagt', datum: tage(1) },
    ],
    jetzt,
  );

  it('rechnet Zahlen der letzten 30 Tage', () => {
    expect(r.find((x) => x.id === 'a')).toMatchObject({
      bewerber30: 7, bewerberVorher: 1, bewerber7: 6, kontaktquote: 71, speedToLeadMin: 10,
      anrufe30: 2, erreichbarkeit: 50, termine30: 1, einstellungen30: 1, ampel: 'gelb',
    });
  });

  it('rot, wenn die Kampagne läuft, aber keine neuen Bewerber kommen bzw. keiner kontaktiert wird', () => {
    const b = r.find((x) => x.id === 'b')!;
    expect(b.ampel).toBe('rot');
    expect(b.hinweise.join(' ')).toContain('7 Tage keine neuen Bewerber');
  });

  it('sortiert: Probleme zuerst, pausierte Kunden zuletzt', () => {
    expect(r.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
});
