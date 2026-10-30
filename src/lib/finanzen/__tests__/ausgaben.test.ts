import { describe, expect, it } from 'vitest';
import { ausgabenImMonat, haendlerGruppe, kategorisiere, leseAmexCsv, type Ausgabe, type Fixkosten } from '../ausgaben';

describe('Kategorien', () => {
  it('ordnet typische Amex-Händler zu', () => {
    expect(kategorisiere('FACEBK *4MTV3BNSQ4 fb.me/ads')).toBe('Werbung');
    expect(kategorisiere('SIXT GMBH & CO. AUTOVER PULLACH')).toBe('Auto & Mobilität');
    expect(kategorisiere('UBER EATS HELP.UBER.COM')).toBe('Essen & Bewirtung');
    expect(kategorisiere('UBER TRIP')).toBe('Auto & Mobilität');
    expect(kategorisiere('CLOSE CRM SAN FRANCISCO')).toBe('Software & Tools');
    expect(kategorisiere('AMZN MKTP DE*NF92A5I94')).toBe('Material & Büro');
    expect(kategorisiere('PLAYTOMIC.IO CA49C2F8')).toBe('Freizeit & Sport');
    expect(kategorisiere('Quadmous')).toBe('Sonstiges');
  });
  it('Händlergruppe ohne Belegnummer', () => {
    expect(haendlerGruppe('FACEBK *4MTV3BNSQ4')).toBe('FACEBK');
  });
});

describe('Amex-CSV', () => {
  it('deutsch mit Semikolon, Zahlung übersprungen, Gutschrift negativ, Dubletten nummeriert', () => {
    const csv = [
      'Datum;Beschreibung;Karteninhaber;Konto #;Betrag',
      '29.09.2026;MIRO.COM AMSTERDAM;FELIX;-92005;20,00',
      '21.09.2026;ZAHLUNG/ÜBERWEISUNG ERHALTEN BESTEN DANK;FELIX;-92005;-3.170,54',
      '01.10.2026;FACEBK *ABC;FELIX;-92005;135,00',
      '01.10.2026;FACEBK *ABC;FELIX;-92005;135,00',
      '02.10.2026;GUTSCHRIFT AMAZON;FELIX;-92005;-14,24',
    ].join('\n');
    const { zeilen, fehler } = leseAmexCsv(csv, 'Okt');
    expect(fehler).toBeNull();
    expect(zeilen.map((z) => [z.datum, z.betrag, z.kategorie])).toEqual([
      ['2026-09-29', 20, 'Software & Tools'],
      ['2026-10-01', 135, 'Werbung'],
      ['2026-10-01', 135, 'Werbung'],
      ['2026-10-02', -14.24, 'Material & Büro'],
    ]);
    expect(new Set(zeilen.map((z) => z.schluessel)).size).toBe(4);
  });
  it('englisch mit Komma', () => {
    const { zeilen } = leseAmexCsv('Date,Description,Amount\n10/01/2026,"CLOSE CRM, SAN FRANCISCO",115.50');
    expect(zeilen[0]).toMatchObject({ datum: '2026-01-10', betrag: 115.5, kategorie: 'Software & Tools' });
  });
  it('ohne passende Spalten → Fehler', () => {
    expect(leseAmexCsv('a;b\n1;2').fehler).toMatch(/Spalten/);
  });
});

describe('Ausgaben je Monat', () => {
  it('Karte + Fixkosten nach Kategorie, privat getrennt', () => {
    const a = (p: Partial<Ausgabe>): Ausgabe => ({ id: 'x', datum: '2026-10-05', haendler: 'X', betrag: 100, kategorie: 'Sonstiges', privat: false, quelle: 'amex', ...p });
    const fix: Fixkosten[] = [{ id: 'f', name: 'Team', kategorie: 'Mitarbeiter', monatlich: 12000, ab: '2026-01-01', bis: null, notiz: null }];
    const m = ausgabenImMonat(
      [a({ haendler: 'FACEBK *1', betrag: 500, kategorie: 'Werbung' }), a({ haendler: 'FACEBK *2', betrag: 300, kategorie: 'Werbung' }), a({ betrag: 50, privat: true }), a({ datum: '2026-09-30' })],
      fix,
      '2026-10',
    );
    expect(m.gesamt).toBe(12800);
    expect(m.privat).toBe(50);
    expect(m.proKategorie.map((k) => k.kategorie)).toEqual(['Mitarbeiter', 'Werbung']);
    expect(m.topHaendler[0]).toEqual({ haendler: 'FACEBK', betrag: 800, posten: 2 });
  });
});

describe('Rücklagen', () => {
  it('USt-Zahllast, Lohnsteuer und 30 % auf den Überschuss; Planwerte nur ohne Kartenumsätze', async () => {
    const { ruecklagen } = await import('../ausgaben');
    const fix: Fixkosten[] = [
      { id: '1', name: 'Gehälter', kategorie: 'Mitarbeiter', monatlich: 10000, ab: '2026-01-01', bis: null, notiz: null },
      { id: '2', name: 'Lohnsteuer', kategorie: 'Lohnsteuer', monatlich: 1000, ab: '2026-01-01', bis: null, notiz: null },
      { id: '3', name: 'Sixt', kategorie: 'Auto & Mobilität', monatlich: 1190, ab: '2026-01-01', bis: null, notiz: null, nur_planung: true },
    ];
    const ohneKarte = ruecklagen({ einnahmenNetto: 40000, umsatzsteuer: 7000, ausgaben: [], fix, monat: '2026-12' });
    expect(ohneKarte).toMatchObject({ vorsteuer: 190, ustZahllast: 6810, lohnsteuer: 1000, ueberschuss: 27810 });
    expect(ohneKarte.ertragsteuer).toBeCloseTo(8343, 0);
    const mitKarte = ruecklagen({
      einnahmenNetto: 40000,
      umsatzsteuer: 7000,
      ausgaben: [{ id: 'a', datum: '2026-12-03', haendler: 'FACEBK', betrag: 5000, kategorie: 'Werbung', privat: false, quelle: 'amex' }],
      fix,
      monat: '2026-12',
    });
    expect(mitKarte.ueberschuss).toBe(24000); // Sixt-Planwert fällt weg, Karte zählt
  });
});
