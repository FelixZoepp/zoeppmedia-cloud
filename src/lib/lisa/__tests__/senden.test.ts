import { describe, expect, it } from 'vitest';
import { baueLisaBewerbung } from '../senden';

describe('baueLisaBewerbung', () => {
  const zugang = { einwilligungText: 'Ich bin einverstanden, dass mich ein digitaler Assistent anruft.', einwilligungVersion: '2026-11-v1' };
  it('Pflichtfelder für Lisa: external_id = Bewerbungs-ID, Einwilligung, Quelle, Name geteilt', () => {
    const b = baueLisaBewerbung(
      { id: 'app-1', source: 'meta_lead', applied_at: '2026-11-05T10:00:00Z', campaign: { campaign_name: 'Herbst', leadgen_id: 123 } },
      { name: 'Max von Mustermann', phone_e164: '+491711234567', phone: '0171 1234567', email: 'max@example.de', location: 'Köln', consent_at: null },
      'Vertriebspartner (m/w/d)',
      zugang,
    );
    expect(b.external_id).toBe('app-1');
    expect(b.first_name).toBe('Max');
    expect(b.last_name).toBe('von Mustermann');
    expect(b.phone).toBe('+491711234567');
    expect(b.source).toBe('meta');
    expect(b.campaign).toBe('Herbst');
    expect(b.meta_lead_id).toBe('123');
    expect(b.consents.call).toBe(true);
    expect(b.consents.call_wording).toBe(zugang.einwilligungText);
    expect(b.consents.recording).toBe(false);
    expect(b.consents.call_at).toBe('2026-11-05T10:00:00Z');
  });
  it('ohne Nachnamen und Kampagne', () => {
    const b = baueLisaBewerbung({ id: 'a', source: 'indeed', applied_at: null, campaign: null }, { name: 'Anna', phone_e164: null, phone: '0151', email: null, location: null, consent_at: null }, null, zugang);
    expect(b.first_name).toBe('Anna');
    expect(b.last_name).toBeNull();
    expect(b.campaign).toBeNull();
    expect(b.phone).toBe('0151');
  });
});
