import { describe, expect, it } from 'vitest';
import { churnNachGrund, type KundeStatus } from '../kundenhistorie';

const k = (kunde: string, p: Partial<KundeStatus>): KundeStatus => ({ id: kunde, kunde, segment: 'd2d', upsell: null, rueckgewinnung: null, aktiv: false, kuendigungsgrund: null, notiz: null, ...p });

describe('Churn nach Grund', () => {
  it('nur gekündigte Direktvertriebskunden, ohne Grund als offen', () => {
    const r = churnNachGrund([
      k('Solvon', { kuendigungsgrund: 'Kommunikation' }),
      k('A', { kuendigungsgrund: 'Zahlungsausfall / Streitfall' }),
      k('B', { kuendigungsgrund: 'Zahlungsausfall / Streitfall' }),
      k('Teo', {}),
      k('Aktiv', { aktiv: true }),
      k('Raus', { segment: 'raus' }),
    ]);
    expect(r).toEqual([
      { grund: 'Zahlungsausfall / Streitfall', anzahl: 2, kunden: ['A', 'B'] },
      { grund: 'Kommunikation', anzahl: 1, kunden: ['Solvon'] },
      { grund: 'Grund offen', anzahl: 1, kunden: ['Teo'] },
    ]);
  });
});
