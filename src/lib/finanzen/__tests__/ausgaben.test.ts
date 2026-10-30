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
