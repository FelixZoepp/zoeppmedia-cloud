import { describe, expect, it } from 'vitest';
import { buildSalesSlackMessage } from '../notify';
import { istReportFunnel, istReportQuelle, leseReportToken, reportErgebnis, reportQuelle, reportSchluessel, reportToken, reportZahlen, waehleReport } from '../report';

describe('Report-Funnel erkennen', () => {
  it('Funnel-Name mit „Report“', () => {
    expect(istReportFunnel('Report-300k')).toBe(true);
    expect(istReportFunnel('Vertriebs-Report')).toBe(true);
    expect(istReportFunnel('Major Vertrieb')).toBe(false);
    expect(istReportFunnel(null)).toBe(false);
  });
  it('Leadquelle', () => {
    expect(reportQuelle('Report-300k')).toBe('Report – 300k');
    expect(reportQuelle('Report')).toBe('Report');
    expect(reportQuelle('Vertriebs-Report')).toBe('Report – Vertriebs-Report');
    expect(istReportQuelle('Report – 300k')).toBe(true);
    expect(istReportQuelle('Meta Ads – Instagram')).toBe(false);
    expect(istReportQuelle('LinkedIn - Roadmap Download')).toBe(false);
  });
  it('Schlüssel für die PDF-Zuordnung', () => {
    expect(reportSchluessel('Report – 300k')).toBe('300k');
    expect(reportSchluessel('Report-300k')).toBe('300k');
    expect(reportSchluessel('Report')).toBe('standard');
    expect(reportSchluessel('Report – Vertrieb Größe')).toBe('vertrieb-grosse');
  });
  it('PDF wählen: passender Schlüssel, sonst der einzige', () => {
    const a = { titel: 'A', pfad: 'a/1.pdf' };
    expect(waehleReport({ '300k': a }, 'Report – 300k')).toBe(a);
    expect(waehleReport({ '300k': a }, 'Report – anders')).toBe(a);
    expect(waehleReport({ '300k': a, b: { titel: 'B', pfad: 'b/1.pdf' } }, 'Report – anders')).toBeNull();
    expect(waehleReport({}, 'Report')).toBeNull();
  });
});

describe('Report-Link', () => {
  it('signiert und prüft', () => {
    process.env.CRON_SECRET = 'test-secret';
    const id = '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f';
    const t = reportToken(id);
    expect(leseReportToken(t)).toBe(id);
    expect(leseReportToken(`${id}.falsch`)).toBeNull();
    expect(leseReportToken('quatsch')).toBeNull();
  });
});

describe('Report-Zahlen', () => {
  const basis = { report: 'Report – 300k', whatsapp_am: null, geoeffnet_am: null, erster_anruf_am: null, gebucht_am: null, ergebnis: 'offen' };
  it('Ergebnis nach 10 Minuten', () => {
    const e = new Date('2026-10-22T10:00:00Z');
    expect(reportErgebnis(e, new Date('2026-10-22T10:08:00Z'))).toBe('direkt_gebucht');
    expect(reportErgebnis(e, new Date('2026-10-22T11:00:00Z'))).toBe('spaeter_gebucht');
    expect(reportErgebnis(e, null)).toBe('nicht_gebucht');
  });
  it('Anruf-Tempo, Öffnungen, Buchungen', () => {
    const z = reportZahlen([
      { ...basis, eingetragen_am: '2026-10-22T10:00:00Z', whatsapp_am: '2026-10-22T10:00:05Z', geoeffnet_am: '2026-10-22T10:02:00Z', erster_anruf_am: '2026-10-22T10:03:00Z', gebucht_am: '2026-10-22T10:05:00Z', ergebnis: 'direkt_gebucht' },
      { ...basis, eingetragen_am: '2026-10-22T11:00:00Z', whatsapp_am: '2026-10-22T11:00:05Z', erster_anruf_am: '2026-10-22T11:20:00Z', ergebnis: 'nicht_gebucht' },
      { ...basis, eingetragen_am: '2026-10-22T12:00:00Z', ergebnis: 'nicht_gebucht' },
    ]);
    expect(z.downloads).toBe(3);
    expect(z.whatsapp).toBe(2);
    expect(z.geoeffnetQuote).toBe(50);
    expect(z.angerufen).toBe(2);
    expect(z.in5MinQuote).toBe(33);
    expect(z.medianMinBisAnruf).toBe(20);
    expect(z.gebucht).toBe(1);
    expect(z.direkt).toBe(1);
    expect(z.reports).toEqual([{ report: 'Report – 300k', downloads: 3, gebucht: 1, gebuchtQuote: 33 }]);
  });
});

describe('Slack mit Erwähnung', () => {
  it('taggt Felix und verlinkt Close', () => {
    const m = buildSalesSlackMessage({ emoji: '📄', title: 'Max hat den Report runtergeladen', body: 'jetzt anrufen', type: 'task_due', erwaehnen: 'U09EK5NAR4P', closeLeadId: 'lead_1' });
    expect(m.text.startsWith('<@U09EK5NAR4P>')).toBe(true);
    expect(JSON.stringify(m.blocks)).toContain('https://app.close.com/lead/lead_1/');
  });
});
