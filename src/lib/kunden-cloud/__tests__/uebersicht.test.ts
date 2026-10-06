import { describe, it, expect } from 'vitest';
import { berechneArbeit } from '../uebersicht';
import { darfKundenCloud } from '../zugriff';

const jetzt = new Date('2026-10-06T12:00:00Z');
const k = (agency_id: string, extra: Record<string, unknown> = {}) => ({
  agency_id,
  current_stage_id: 'neu',
  created_at: '2026-10-06T08:00:00Z',
  first_contact_at: null,
  erster_kontaktversuch_am: null,
  cadence_active: false,
  cadence_next_at: null,
  blacklisted: false,
  ...extra,
});

describe('berechneArbeit', () => {
  const agencies = [
    { id: 'a', name: 'Alpha', settings: { logo_url: 'https://x/logo.png' }, fulfillment_phase: 'continuity', pausiert_grund: null },
    { id: 'b', name: 'Beta', settings: null, fulfillment_phase: 'setup', pausiert_grund: 'Urlaub' },
  ];
  const r = berechneArbeit(
    agencies,
    [
      k('a'),
      k('a', { created_at: '2026-10-01T08:00:00Z' }),
      k('a', { first_contact_at: '2026-10-06T09:00:00Z' }),
      k('a', { current_stage_id: 'quali', cadence_active: true, cadence_next_at: '2026-10-06T11:00:00Z' }),
      k('a', { blacklisted: true }),
      k('b', { current_stage_id: null, created_at: '2026-09-20T08:00:00Z' }),
    ],
    new Map([['neu', 'new'], ['quali', 'qualifying']]),
    new Map([['b', 4]]),
    jetzt,
  );

  it('zählt Eingang, ohne Kontakt, heute, fällige Anrufe und ungelesene Nachrichten', () => {
    const a = r.find((x) => x.id === 'a')!;
    expect(a).toMatchObject({ slug: null, zuBearbeiten: 3, ohneKontakt: 2, neuHeute: 3, anrufeFaellig: 1, ungelesen: 0, logo_url: 'https://x/logo.png' });
    expect(a.aeltesterOhneKontakt).toBe('2026-10-01T08:00:00Z');
    expect(r.find((x) => x.id === 'b')).toMatchObject({ zuBearbeiten: 1, ohneKontakt: 1, ungelesen: 4, pausiert: true });
  });

  it('sortiert nach Dringlichkeit, pausierte Kunden nach hinten', () => {
    expect(r[0].id).toBe('a');
  });
});

describe('darfKundenCloud', () => {
  it('Admins und Innendienst ja, Kundenberater und andere nein', () => {
    expect(darfKundenCloud({ role: 'admin', funktion: null })).toBe(true);
    expect(darfKundenCloud({ role: 'employee', funktion: 'innendienst' })).toBe(true);
    expect(darfKundenCloud({ role: 'employee', funktion: 'csm' })).toBe(false);
    expect(darfKundenCloud({ role: 'employee', funktion: 'setter' })).toBe(false);
    expect(darfKundenCloud({ role: 'agency_owner', funktion: 'innendienst' })).toBe(false);
    expect(darfKundenCloud(null)).toBe(false);
  });
});
