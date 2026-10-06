import { describe, it, expect } from 'vitest';
import { berechneAnbindung } from '../status';

const jetzt = new Date('2026-10-06T12:00:00Z');
const ag = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, settings: null, fulfillment_phase: 'continuity', pausiert_grund: null, meta_ad_account_id: null, ...extra,
});

describe('berechneAnbindung', () => {
  const r = berechneAnbindung(
    [ag('fadi'), ag('turhan', { meta_ad_account_id: 'act_1' }), ag('neu')],
    [
      { agency_id: 'fadi', source: 'meta', created_at: '2026-10-05T10:00:00Z' },
      { agency_id: 'fadi', source: 'indeed', created_at: '2026-10-05T10:00:00Z' },
      { agency_id: 'turhan', source: 'indeed', created_at: '2026-09-01T10:00:00Z' },
    ],
    [{ agency_id: 'turhan', perspective_funnel_id: 'f1' }],
    [],
    [{ agency_id: 'turhan', date: '2026-10-05' }],
    [],
    [{ agency_id: 'fadi', status: 'active' }, { agency_id: 'turhan', status: 'active' }],
    jetzt,
  );
  it('erkennt laufende, eingerichtete und fehlende Kanäle', () => {
    const fadi = r.find((k) => k.id === 'fadi')!;
    expect(fadi.meta.status).toBe('aktiv');
    expect(fadi.indeed.status).toBe('aktiv');
    expect(fadi.offen).toEqual(['Meta-Werbekonto-ID hinterlegen']);
    const turhan = r.find((k) => k.id === 'turhan')!;
    expect(turhan).toMatchObject({ meta: { status: 'eingerichtet', funnel: true }, indeed: { status: 'eingerichtet' }, werbekonto: { status: 'aktiv' } });
    const neu = r.find((k) => k.id === 'neu')!;
    expect(neu.offen).toEqual(['Meta-Leads/Funnel anbinden', 'Indeed-Weiterleitung einrichten', 'Meta-Werbekonto-ID hinterlegen', 'Aktive Stelle anlegen']);
    expect(r[0].id).toBe('neu');
  });
});
