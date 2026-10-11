import { describe, expect, it, vi } from 'vitest';
import { berichtsZeitraum, geschaeftsAlarme, kurzfassung, planeCeoBriefing, werktage, briefingHtml, type BriefingDaten } from '../ceo-briefing';
import { LEER_SALES } from '../abendbericht';

function svcMock() {
  const inserts: unknown[] = [];
  const svc = { from: () => ({ insert: vi.fn(async (row: unknown) => (inserts.push(row), { error: null })) }) };
  return { svc: svc as never, inserts };
}

describe('Planung', () => {
  it('Mo–Fr ab 7 Uhr, nicht am Wochenende, nicht nach 12 Uhr', async () => {
    const frueh = svcMock();
    await planeCeoBriefing(frueh.svc, new Date('2026-10-12T04:59:00Z')); // Mo 6:59
    expect(frueh.inserts).toHaveLength(0);
    const ok = svcMock();
    await planeCeoBriefing(ok.svc, new Date('2026-10-12T05:00:00Z')); // Mo 7:00
    expect(ok.inserts[0]).toMatchObject({ type: 'berichte.ceo', dedupe_key: 'berichte.ceo:2026-10-12' });
    const sa = svcMock();
    await planeCeoBriefing(sa.svc, new Date('2026-10-10T06:00:00Z')); // Sa
    expect(sa.inserts).toHaveLength(0);
    const spaet = svcMock();
    await planeCeoBriefing(spaet.svc, new Date('2026-10-13T10:00:00Z')); // Di 12:00
    expect(spaet.inserts).toHaveLength(0);
  });

  it('Zeitraum: Vortag, montags Freitag bis Sonntag', () => {
    expect(berichtsZeitraum('2026-10-13')).toMatchObject({ von: '2026-10-12', bis: '2026-10-12' });
    const mo = berichtsZeitraum('2026-10-12');
    expect(mo).toMatchObject({ von: '2026-10-09', bis: '2026-10-11' });
    expect(mo.label).toContain('Wochenende');
  });

  it('Werktage im Monat', () => {
    expect(werktage('2026-10-09')).toEqual({ vorbei: 7, gesamt: 22 });
  });
});

describe('Alarme', () => {
  const basis = { sales: LEER_SALES, sales7: LEER_SALES, marketing: null, cplSchnitt14: null, monatVolumen: 0, prognose: null, werktageVorbei: 3, roteKunden: 0, beendet: [] as string[] };

  it('ruhiger Tag → keine Alarme', () => {
    expect(geschaeftsAlarme(basis)).toEqual([]);
  });

  it('Kündigung, 0 Abschlüsse, schwache Prognose, CPL-Sprung', () => {
    const a = geschaeftsAlarme({
      ...basis,
      beendet: ['Muster GmbH'],
      sales7: { ...LEER_SALES, closingsGehalten: 8 },
      prognose: 150_000,
      werktageVorbei: 8,
      marketing: { ausgaben: 600, impressionen: 1, klicks: 1, linkKlicks: 1, metaLeads: 4, eintragungen: 4, direktGebucht: 0 },
      cplSchnitt14: 80,
    });
    const t = a.map((x) => `${x.stufe}:${x.text}`).join('\n');
    expect(t).toContain('rot:Kündigung/Ende: Muster GmbH');
    expect(t).toContain('rot:0 Abschlüsse in den letzten 7 Tagen');
    expect(t).toContain('rot:Monatsprognose');
    expect(t).toContain('gelb:Kosten pro Lead');
    expect(a[a.length - 1].stufe).toBe('gelb');
  });

  it('Show-up-Einbruch nur ab genug Terminen', () => {
    expect(geschaeftsAlarme({ ...basis, sales: { ...LEER_SALES, settingsGehalten: 1, settingsNoShow: 2 } })).toEqual([]);
    expect(geschaeftsAlarme({ ...basis, sales: { ...LEER_SALES, settingsGehalten: 1, settingsNoShow: 3 } })[0].text).toContain('Show-up Settings');
  });
});

describe('Darstellung', () => {
  const b: BriefingDaten = {
    tag: '2026-10-13',
    zeitraum: { von: '2026-10-12', bis: '2026-10-12', label: 'Gestern (Mo., 12.10.)' },
    alarme: [{ stufe: 'rot', text: '<script>x</script>' }],
    sales: { abschluesse: 2, volumen: 12000, settingsGehalten: 9, settingsNoShow: 1, closingsGehalten: 4, closingsNoShow: 0, settingsGebucht: 11, closingsGebucht: 3, showUpSetting: 90, showUpClosing: 100, closingRate: 50, protokolleFehlen: 0, monat: { volumen: 90000, abschluesse: 9, ziel: 300000, prognose: 220000, werktageVorbei: 8, werktageGesamt: 22 } },
    marketing: { verbunden: true, ausgaben: 300, leads: 6, cpl: 50, cplSchnitt14: 45, direktQuote: 40 },
    kunden: { aktiv: 30, mrr: 60000, ampel: { gruen: 20, gelb: 7, rot: 3 }, neu: ['Neu AG'], beendet: [], bewerber: 140, bewerberWoche: 700, bewerberVorwoche: 650, starts7: [] },
    ausnahmen: [],
    entscheidungen: [],
    prioritaeten: [],
  };

  it('Kurzfassung mit Ampel-Zähler', () => {
    const k = kurzfassung(b);
    expect(k.titel).toContain('🔴 1');
    expect(k.text).toContain('2 Abschl.');
  });

  it('HTML maskiert Inhalte', () => {
    const h = briefingHtml(b);
    expect(h).not.toContain('<script>');
    expect(h).toContain('Neu AG');
    expect(h).toContain('Prognose');
  });
});
