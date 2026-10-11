import { describe, expect, it, vi } from 'vitest';
import { baueBlocks, fortschrittsBalken, istWerktag, letzterWerktag, marketingFelder, planeAbendbericht, salesFelder, salesHinweise } from '../abendbericht';

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

describe('Wochenende', () => {
  it('plant samstags und sonntags keinen Slack-Bericht', async () => {
    const sa = svcMock();
    await planeAbendbericht(sa.svc, new Date('2026-10-10T18:30:00Z')); // Sa 20:30
    expect(sa.inserts).toHaveLength(0);
    const so = svcMock();
    await planeAbendbericht(so.svc, new Date('2026-10-11T18:30:00Z')); // So 20:30
    expect(so.inserts).toHaveLength(0);
  });

  it('Monatsbericht am letzten Werktag (Monatsende am Wochenende → Freitag davor)', () => {
    expect(letzterWerktag('2026-10-05')).toBe('2026-10-30'); // 31.10. ist Samstag
    expect(letzterWerktag('2026-09-10')).toBe('2026-09-30'); // Mittwoch
    expect(istWerktag('2026-10-10')).toBe(false);
    expect(istWerktag('2026-10-09')).toBe(true);
  });
});

describe('Berichtstexte', () => {
  it('Marketing: Ausgaben, Leads, Kosten pro Lead, Klicks', () => {
    const t = marketingFelder({ ausgaben: 200, impressionen: 10000, klicks: 300, linkKlicks: 150, metaLeads: 5, eintragungen: 4, direktGebucht: 2 }).join('\n');
    expect(t).toContain('*🧲 Leads*\n4 (Meta: 5)');
    expect(t).toContain('50,00');
    expect(t).toContain('CTR 1,5 %');
    expect(t).toContain('*⚡ Direkt gebucht*\n50 %');
  });

  it('Sales: Abschlüsse zuerst, geführte Settings/Closings, No-Shows und Quoten', () => {
    const werte = {
      anwahlen: 40, gespraeche: 12, entscheider: 8, protokolleFehlen: 1, settingsGebucht: 5, settingsGehalten: 6, settingsNoShow: 2,
      settingsUnqualifiziert: 1, closingsGebucht: 3, closingsGehalten: 2, closingsNoShow: 1, abschluesse: 1, volumen: 6000, eintragungen: 0, direktGebucht: 0,
    };
    const f = salesFelder(werte);
    expect(f[0]).toContain('🏆 Abschlüsse');
    const t = f.join('\n');
    expect(t).toContain('6 geführt · 2 No-Show\nShow-up 75 %');
    expect(t).toContain('2 geführt · 1 No-Show\nShow-up 66,7 %');
    expect(t).toContain('*📈 Closing-Rate*\n50 %');
    expect(salesHinweise(werte).join(' ')).toContain('1 Protokoll fehlen');
  });

  it('Blocks: Kopf, Trenner zwischen Zeiträumen, max. 10 Felder je Abschnitt', () => {
    const b = baueBlocks('💼 Sales', [{ titel: 'A', felder: Array(12).fill('x') }, { titel: 'B', felder: ['y'] }], 'Fuß') as Array<{ type: string; fields?: unknown[] }>;
    expect(b[0].type).toBe('header');
    expect(b.filter((x) => x.type === 'divider')).toHaveLength(1);
    expect(b.filter((x) => x.fields).map((x) => x.fields!.length)).toEqual([10, 2, 1]);
    expect(fortschrittsBalken(0.34)).toBe('▰▰▰▱▱▱▱▱▱▱');
  });
});
