import { describe, it, expect } from 'vitest';
import { shouldAlertFeed, shouldAlertErrorRate } from '@/lib/monitoring/ingest-monitor';

describe('shouldAlertFeed', () => {
  it('alarmiert bei Polls ohne Bewerbungen', () => expect(shouldAlertFeed(5, 0)).toBe(true));
  it('kein Alarm ohne Polls', () => expect(shouldAlertFeed(0, 0)).toBe(false));
  it('kein Alarm wenn Bewerbungen ankamen', () => expect(shouldAlertFeed(5, 2)).toBe(false));
});

describe('shouldAlertErrorRate', () => {
  it('alarmiert über 1 % bei genug Volumen', () => expect(shouldAlertErrorRate(2, 100)).toBe(true));
  it('kein Alarm unter Mindestvolumen 20', () => expect(shouldAlertErrorRate(1, 10)).toBe(false));
  it('kein Alarm bei exakt 1 %', () => expect(shouldAlertErrorRate(1, 100)).toBe(false));
});
