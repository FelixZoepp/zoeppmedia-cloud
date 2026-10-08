import { describe, expect, it, vi } from 'vitest';
import { marketingZeilen, planeAbendbericht, salesZeilen } from '../abendbericht';

function svcMock() {
  const inserts: unknown[] = [];
  const svc = { from: () => ({ insert: vi.fn(async (row: unknown) => (inserts.push(row), { error: null })) }) };
  return { svc: svc as never, inserts };
}

describe('planeAbendbericht', () => {
  it('plant erst ab 20 Uhr Berliner Zeit, mit Tages-Dedupe', async () => {
    const vorher = svcMock();
    await planeAbendbericht(vorher.svc, new Date('2026-10-08T17:59:00Z')); // 19:59 Berlin
    expect(vorher.inserts).toHaveLength(0);
    const danach = svcMock();
    await planeAbendbericht(danach.svc, new Date('2026-10-08T18:00:00Z')); // 20:00 Berlin
    expect(danach.inserts[0]).toMatchObject({ type: 'berichte.abend', payload: { tag: '2026-10-08' }, dedupe_key: 'berichte.abend:2026-10-08' });
  });
});

describe('Berichtstexte', () => {
  it('Marketing: Ausgaben, Leads, CPL, Impressionen, Klicks', () => {
    const t = marketingZeilen({ ausgaben: 200, impressionen: 10000, klicks: 300, linkKlicks: 150, metaLeads: 5, eintragungen: 4, direktGebucht: 2 }).join('\n');
    expect(t).toContain('Leads *4*');
    expect(t).toContain('CPL *50,00');
    expect(t).toContain('Link-Klicks 150');
    expect(t).toContain('CTR 1,5 %');
    expect(t).toContain('Direkt gebucht 50 %');
  });

  it('Sales: geführte Settings/Closings, No-Shows und Quoten', () => {
    const t = salesZeilen({
      anwahlen: 40, gespraeche: 12, entscheider: 8, protokolleFehlen: 1, settingsGebucht: 5, settingsGehalten: 6, settingsNoShow: 2,
      settingsUnqualifiziert: 1, closingsGebucht: 3, closingsGehalten: 2, closingsNoShow: 1, abschluesse: 1, volumen: 6000, eintragungen: 0, direktGebucht: 0,
    }).join('\n');
    expect(t).toContain('Settings geführt *6* · No-Shows 2 · Show-up 75 %');
    expect(t).toContain('Closings geführt *2* · No-Shows 1 · Show-up 66,7 %');
    expect(t).toContain('Closing-Rate 50 %');
  });
});
