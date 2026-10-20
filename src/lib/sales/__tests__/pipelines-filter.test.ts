import { describe, expect, it } from 'vitest';
import { istUpsellStatus, UPSELL_FILTER, UPSELL_STATUS } from '../pipelines';

describe('Pipeline-Filter (Close kennt kein pipeline_id beim Auflisten)', () => {
  it('Upsell-Filter läuft über die Status-IDs', () => {
    expect(UPSELL_FILTER).toMatch(/^status_id__in=stat_/);
    expect(UPSELL_FILTER).not.toContain('pipeline_id');
    for (const id of Object.values(UPSELL_STATUS)) expect(UPSELL_FILTER).toContain(id);
  });

  it('D2D-Status (Setting - Terminiert) ist kein Upsell', () => {
    expect(istUpsellStatus('stat_ijQBHlkm3ij7uu8hnszgMzR3eIvWVKMo6vkrIVGyKBH')).toBe(false);
    expect(istUpsellStatus(UPSELL_STATUS.potenzial)).toBe(true);
    expect(istUpsellStatus(null)).toBe(false);
  });
});
