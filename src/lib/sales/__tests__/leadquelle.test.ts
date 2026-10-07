import { describe, it, expect } from 'vitest';
import { automatischeLeadquelle, istFunnelLead, leadquelleAusUtm, leseLeadFelder, UTM_CF, LEADQUELLE_CF, FUNNEL_FRAGEN_CF } from '../leadquelle';

const leer = { leadquelle: null, utmSource: null, utmMedium: null, utmCampaign: null, datumEintragung: null, funnelFragen: false };

describe('Leadquelle', () => {
  it('liest Close-Felder', () => {
    const f = leseLeadFelder({ [`custom.${UTM_CF.source}`]: 'ig', [`custom.${LEADQUELLE_CF}`]: '  ', [`custom.${FUNNEL_FRAGEN_CF[0]}`]: 'Schlechte Bewerber' });
    expect(f).toMatchObject({ utmSource: 'ig', leadquelle: null, funnelFragen: true });
  });

  it('erkennt von Hand angelegte Leads', () => {
    expect(istFunnelLead(leer)).toBe(false);
    expect(istFunnelLead({ ...leer, funnelFragen: true })).toBe(true);
    expect(istFunnelLead({ ...leer, utmSource: 'ig' })).toBe(true);
  });

  it('leitet die Quelle aus UTM ab', () => {
    expect(leadquelleAusUtm({ utmSource: 'ig', utmMedium: 'paid', utmCampaign: '120247195982360485' })).toBe('Meta Ads – Instagram');
    expect(leadquelleAusUtm({ utmSource: 'fb', utmMedium: null, utmCampaign: null })).toBe('Meta Ads – Facebook');
    expect(leadquelleAusUtm({ utmSource: 'instagram', utmMedium: 'bio', utmCampaign: null })).toBe('Instagram (organisch)');
    expect(leadquelleAusUtm({ utmSource: 'linkedin', utmMedium: 'post', utmCampaign: null })).toBe('LinkedIn (post)');
    expect(leadquelleAusUtm({ utmSource: 'google', utmMedium: 'cpc', utmCampaign: null })).toBe('Google Ads');
    expect(leadquelleAusUtm({ utmSource: null, utmMedium: null, utmCampaign: null })).toBeNull();
  });

  it('setzt nur fehlende Quellen bei Funnel-Leads', () => {
    expect(automatischeLeadquelle({ ...leer, leadquelle: 'Empfehlung - X', utmSource: 'ig' })).toBeNull();
    expect(automatischeLeadquelle(leer)).toBeNull();
    expect(automatischeLeadquelle({ ...leer, funnelFragen: true })).toBe('Funnel (ohne UTM)');
    expect(automatischeLeadquelle({ ...leer, utmSource: 'ig', utmMedium: 'paid' })).toBe('Meta Ads – Instagram');
  });
});
