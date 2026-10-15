import { describe, expect, it } from 'vitest';
import { nachrichtText, vornameVon } from '../nicht-erreicht';
import { TEMPLATE_PRESETS } from '@/lib/whatsapp/template-presets';

describe('Bewerber nicht erreicht', () => {
  it('Freitext entspricht der Vorlage', () => {
    const preset = TEMPLATE_PRESETS.find((p) => p.presetKey === 'bewerber_nicht_erreicht')!;
    expect(preset.category).toBe('UTILITY');
    expect(nachrichtText('Mehmet', 'Solar Nord GmbH')).toBe(preset.body.replace('{{1}}', 'Mehmet').replace('{{2}}', 'Solar Nord GmbH'));
  });

  it('Vorname aus dem Namen, sonst „du“', () => {
    expect(vornameVon('Mehmet Yilmaz')).toBe('Mehmet');
    expect(vornameVon('  ')).toBe('du');
    expect(vornameVon(null)).toBe('du');
  });
});
