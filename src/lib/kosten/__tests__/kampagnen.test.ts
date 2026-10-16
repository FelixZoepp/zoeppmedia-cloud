import { describe, expect, it } from 'vitest';
import { autoStelle, extrahiereUtm, istKampagnenId, zuordnungenAusBewerbern } from '../kampagnen';

describe('extrahiereUtm', () => {
  it('liest utmParams unter body.meta', () => {
    expect(extrahiereUtm({ meta: { utmParams: { utm_campaign: '120211', utm_term: '120212', utm_content: 'Video A', utm_source: 'fb' } } })).toEqual({
      campaign: '120211', adset: '120212', ad: 'Video A', source: 'fb',
    });
  });

  it('liest utm_* direkt unter meta, im Profil ({ value }) und flach', () => {
    expect(extrahiereUtm({ meta: { utm_campaign: '1234567' } })?.campaign).toBe('1234567');
    expect(extrahiereUtm({ profile: { utm_campaign: { value: '7654321', title: 'utm_campaign' }, utm_term: { value: '99' } } })).toMatchObject({ campaign: '7654321', adset: '99' });
    expect(extrahiereUtm({ utm_campaign: 555555, utmContent: 'Bild' })).toMatchObject({ campaign: '555555', ad: 'Bild' });
  });

  it('liest UTM aus einer URL und ignoriert Platzhalter', () => {
    expect(extrahiereUtm({ meta: { url: 'https://karriere.x.de/?utm_campaign=120333&utm_term=120334' } })).toMatchObject({ campaign: '120333', adset: '120334' });
    expect(extrahiereUtm({ meta: { utm_campaign: '{{campaign.id}}' } })).toBeNull();
    expect(extrahiereUtm({ name: 'Max' })).toBeNull();
  });

  it('meta.utmParams hat Vorrang vor Profil-Feldern', () => {
    expect(extrahiereUtm({ meta: { utmParams: { utm_campaign: '111111' } }, profile: { utm_campaign: { value: '222222' } } })?.campaign).toBe('111111');
  });
});

describe('Zuordnungs-Logik', () => {
  it('Kampagnen-ID nur numerisch', () => {
    expect(istKampagnenId('120200000000001')).toBe(true);
    expect(istKampagnenId('Vertrieb Berlin')).toBe(false);
    expect(istKampagnenId(null)).toBe(false);
  });

  it('automatisch auf die Stelle nur bei genau einer aktiven Stelle', () => {
    expect(autoStelle(['j1'])).toBe('j1');
    expect(autoStelle(['j1', 'j2'])).toBeNull();
    expect(autoStelle([])).toBeNull();
  });

  it('aus vorhandenen Bewerbern: eindeutig → Stelle, verteilt/fremd → offen, bestehende bleiben', () => {
    const r = zuordnungenAusBewerbern(
      [
        { agency_id: 'a', meta_campaign: '1000001', job_id: 'j1' },
        { agency_id: 'a', meta_campaign: '1000001', job_id: 'j1' },
        { agency_id: 'a', meta_campaign: '1000002', job_id: 'j1' },
        { agency_id: 'a', meta_campaign: '1000002', job_id: 'j2' },
        { agency_id: 'a', meta_campaign: '1000003', job_id: null },
        { agency_id: 'a', meta_campaign: '1000004', job_id: 'j1' },
        { agency_id: 'b', meta_campaign: '1000004', job_id: 'j9' },
        { agency_id: 'a', meta_campaign: '1000005', job_id: 'j1' },
        { agency_id: 'a', meta_campaign: '1000006', job_id: 'j1' },
        { agency_id: 'a', meta_campaign: 'kein-id', job_id: 'j1' },
      ],
      new Set(['1000005']),
      new Map([['1000006', 'b']]),
    );
    expect(r.neu).toEqual([{ campaign_id: '1000001', agency_id: 'a', job_id: 'j1' }]);
    expect(r.mehrdeutig.sort()).toEqual(['1000002', '1000003', '1000004', '1000006']);
  });
});
