import { describe, it, expect } from 'vitest';
import { baueErinnerungen } from '../step-reminders';

describe('baueErinnerungen', () => {
  it('fasst je Person zusammen und trennt eigene Arbeit von Kunden-Schritten', () => {
    const r = baueErinnerungen(
      [
        { owner_user_id: 'felix', agency_id: 'a', step_key: 's_ideen', wer: 'zoepp', status: 'offen', faellig_am: '2026-10-01' },
        { owner_user_id: 'felix', agency_id: 'b', step_key: 'o_bilder', wer: 'kunde', status: 'offen', faellig_am: '2026-09-30' },
        { owner_user_id: 'felix', agency_id: 'b', step_key: 'o_meta_seite', wer: 'kunde', status: 'zur_pruefung', faellig_am: '2026-10-02' },
        { owner_user_id: 'nils', agency_id: 'a', step_key: 's_ideen', wer: 'zoepp', status: 'in_arbeit', faellig_am: '2026-10-03' },
      ],
      new Map([['a', 'Alpha GmbH'], ['b', 'Beta AG']]),
    );
    const felix = r.find((e) => e.user_id === 'felix')!;
    expect(felix).toMatchObject({ eigene: 2, kunde: 1, titel: '3 Schritte überfällig' });
    expect(felix.text).toContain('Beta AG');
    expect(felix.text.startsWith('2 bei dir · 1 beim Kunden nachfassen')).toBe(true);
    expect(r.find((e) => e.user_id === 'nils')).toMatchObject({ titel: '1 Schritt überfällig', eigene: 1, kunde: 0 });
  });
});
