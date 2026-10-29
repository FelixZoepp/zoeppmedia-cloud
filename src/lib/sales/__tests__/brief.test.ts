import { beforeAll, describe, expect, it } from 'vitest';
import { BRIEF_FUNNEL, briefAlsFunnelLead, briefCalendlyUrl, briefOriginErlaubt, briefToken, leseBriefAnfrage, leseBriefToken } from '../brief';

beforeAll(() => {
  process.env.CRON_SECRET = 'test-secret';
});

describe('Brief: persönlicher Link', () => {
  it('Token hin und zurück', () => {
    const t = briefToken('lead_abcdefghijklmnop');
    expect(leseBriefToken(t)).toBe('lead_abcdefghijklmnop');
  });
  it('gefälschte oder kaputte Tokens werden abgelehnt', () => {
    const t = briefToken('lead_abcdefghijklmnop');
    expect(leseBriefToken(t.replace('lead_abcdefghijklmnop', 'lead_zzzzzzzzzzzzzzzz'))).toBeNull();
    expect(leseBriefToken(`${t}.x`)).toBeNull();
    expect(leseBriefToken('lead_abcdefghijklmnop.falsch')).toBeNull();
    expect(leseBriefToken(null)).toBeNull();
  });
});

describe('Brief: Herkunft', () => {
  it('nur die eigenen Seiten', () => {
    expect(briefOriginErlaubt('https://felixzoepp.de')).toBe(true);
    expect(briefOriginErlaubt('https://felix-zoepp-website-abc123-felix-1214s-projects.vercel.app')).toBe(true);
    expect(briefOriginErlaubt('https://evil.example')).toBe(false);
    expect(briefOriginErlaubt('https://felixzoepp.de.evil.example')).toBe(false);
    expect(briefOriginErlaubt(null)).toBe(false);
  });
});

describe('Brief: Anfrage', () => {
  const body = { name: ' Max Muster ', firma: 'Muster Vertrieb', tel: '0151 2345678', branche: ['Glasfaser', 'Energie & Solar'], rolle: 'Inhaber', team: '6–20', ziel: '4–8', utm: { source: 'facebook', campaign: 'retargeting' } };

  it('liest Kontakt und Antworten', () => {
    const a = leseBriefAnfrage(body)!;
    expect(a.name).toBe('Max Muster');
    expect(a.branche).toEqual(['Glasfaser', 'Energie & Solar']);
    expect(a.utm.source).toBe('facebook');
    const l = briefAlsFunnelLead(a);
    expect(l.funnelName).toBe(BRIEF_FUNNEL);
    expect(l.phone).toBe('0151 2345678');
    expect(l.antworten.map((x) => x.frage)).toEqual(['Firma', 'Branche', 'Rolle', 'Teamgröße', 'Einstellungen pro Monat']);
  });

  it('ohne Name, Firma oder Telefon → null', () => {
    expect(leseBriefAnfrage({ ...body, name: '' })).toBeNull();
    expect(leseBriefAnfrage({ ...body, firma: '  ' })).toBeNull();
    expect(leseBriefAnfrage({ ...body, tel: '12' })).toBeNull();
  });

  it('Calendly mit Name und Herkunft', () => {
    const u = new URL(briefCalendlyUrl('Max Muster', 'followup'));
    expect(u.searchParams.get('name')).toBe('Max Muster');
    expect(u.searchParams.get('utm_source')).toBe('followup');
    expect(u.searchParams.get('utm_campaign')).toBe('brief-vertriebsleiter');
  });
});
