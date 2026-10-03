import { describe, it, expect } from 'vitest';
import { stepZeiten, proKunde, bremsendeSchritte } from '../analyse';

const step = (over: Record<string, unknown>) => ({
  id: 's1', agency_id: 'ag-1', step_key: 'o_meta_seite', phase: 'onboarding' as const, wer: 'kunde' as const,
  status: 'erledigt', gestartet_am: '2026-10-01T00:00:00Z', erledigt_am: null, faellig_am: '2026-10-04', ...over,
});

describe('stepZeiten', () => {
  it('Kunden-Schritt: Wartezeit beim Kunden, Prüfzeit bei uns', () => {
    const [z] = stepZeiten(
      [step({ erledigt_am: '2026-10-09T00:00:00Z' })],
      [
        { step_id: 's1', nach_status: 'zur_pruefung', created_at: '2026-10-07T00:00:00Z' }, // 6 Tage beim Kunden
        { step_id: 's1', nach_status: 'erledigt', created_at: '2026-10-09T00:00:00Z' }, // 2 Tage Prüfung bei uns
      ],
    );
    expect(z).toMatchObject({ tage_kunde: 6, tage_zoepp: 2, tage_ueber_frist: 4, offen: false });
  });

  it('zurück an den Kunden → Zeit zählt wieder beim Kunden', () => {
    const [z] = stepZeiten(
      [step({ erledigt_am: '2026-10-08T00:00:00Z' })],
      [
        { step_id: 's1', nach_status: 'zur_pruefung', created_at: '2026-10-02T00:00:00Z' },
        { step_id: 's1', nach_status: 'offen', created_at: '2026-10-03T00:00:00Z' },
        { step_id: 's1', nach_status: 'erledigt', created_at: '2026-10-08T00:00:00Z' },
      ],
    );
    expect(z).toMatchObject({ tage_kunde: 6, tage_zoepp: 1 });
  });

  it('eigener Schritt, noch offen → Zeit läuft bei uns bis jetzt', () => {
    const [z] = stepZeiten([step({ step_key: 's_funnel', wer: 'zoepp', status: 'offen' })], [], new Date('2026-10-06T00:00:00Z'));
    expect(z).toMatchObject({ tage_zoepp: 5, tage_kunde: 0, tage_ueber_frist: 1, offen: true });
  });

  it('"nicht nötig" zählt nicht', () => {
    expect(stepZeiten([step({ status: 'nicht_noetig' })], [])).toEqual([]);
  });
});

describe('Auswertung', () => {
  const zeiten = stepZeiten(
    [
      step({ id: 'a', erledigt_am: '2026-10-10T00:00:00Z' }), // Kunde 9 Tage, 5 über Frist (Frist gilt bis Tagesende)
      step({ id: 'b', step_key: 's_funnel', phase: 'setup', wer: 'zoepp', erledigt_am: '2026-10-06T00:00:00Z' }), // 1 über Frist
      step({ id: 'c', agency_id: 'ag-2', erledigt_am: '2026-10-03T00:00:00Z' }), // pünktlich
    ],
    [],
  );

  it('pro Kunde: wer hat gebremst?', () => {
    const ag1 = proKunde(zeiten).find((k) => k.agency_id === 'ag-1')!;
    expect(ag1).toMatchObject({ tage_kunde: 9, tage_zoepp: 5, tage_ueber_frist: 6, bremse: 'kunde' });
    expect(ag1.langsamste[0]).toMatchObject({ titel: 'Zugriff auf Facebook-Seite gegeben', wer: 'kunde' });
    expect(proKunde(zeiten).find((k) => k.agency_id === 'ag-2')!.bremse).toBeNull();
  });

  it('über alle Kunden: Facebook-Seite bremst am meisten', () => {
    const b = bremsendeSchritte(zeiten);
    expect(b[0]).toMatchObject({ step_key: 'o_meta_seite', anzahl: 2, davon_verspaetet: 1, wer: 'kunde' });
  });
});
