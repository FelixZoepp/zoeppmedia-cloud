import { describe, expect, it } from 'vitest';
import { ENV_CHECKS, pruefeEnv } from '../check';

describe('Einrichtungs-Check', () => {
  it('meldet nur gesetzt/fehlt, nie den Wert', () => {
    const r = pruefeEnv({ CLOSE_API_KEY: 'geheim', CRON_SECRET: '   ' });
    const close = r.find((e) => e.name === 'CLOSE_API_KEY')!;
    expect(close.gesetzt).toBe(true);
    expect(JSON.stringify(r)).not.toContain('geheim');
    expect(r.find((e) => e.name === 'CRON_SECRET')!.gesetzt).toBe(false);
    expect(r).toHaveLength(ENV_CHECKS.length);
  });
});
