/**
 * Tests für toCsv (src/lib/kpi/csv.ts).
 * Prüft BOM, CRLF, Semikolon-Delimiter, Escaping und Prozentformat.
 */

import { describe, it, expect } from 'vitest';
import { toCsv, formatPercent } from '../csv';

describe('toCsv', () => {
  it('beginnt mit UTF-8-BOM (\\uFEFF)', () => {
    const result = toCsv(['A'], [['x']]);
    expect(result.startsWith('\uFEFF')).toBe(true);
  });

  it('Header-Zeile mit Semikolon-Delimiter', () => {
    const result = toCsv(['Job', 'Status', 'Bewerbungen'], []);
    // Nach BOM kommt die Header-Zeile
    expect(result.slice(1)).toMatch(/^Job;Status;Bewerbungen/);
  });

  it('Zeilen enden mit CRLF', () => {
    const result = toCsv(['A', 'B'], [['1', '2']]);
    // Jede Zeile endet mit \r\n
    expect(result).toContain('\r\n');
    // Header + 1 Datenzeile = 2x CRLF
    const crlfCount = (result.match(/\r\n/g) ?? []).length;
    expect(crlfCount).toBe(2);
  });

  it('nur Header, keine Datenzeilen → genau 1 CRLF', () => {
    const result = toCsv(['Spalte'], []);
    expect(result).toBe('\uFEFFSpalte\r\n');
  });

  it('Felder mit Semikolon werden in Anführungszeichen eingeschlossen', () => {
    const result = toCsv(['Job'], [['Verkäufer; Außendienst']]);
    expect(result).toContain('"Verkäufer; Außendienst"');
  });

  it('Felder mit Anführungszeichen werden korrekt verdoppelt', () => {
    const result = toCsv(['Titel'], [['Er sagte "Hallo"']]);
    expect(result).toContain('"Er sagte ""Hallo"""');
  });

  it('Felder mit Zeilenumbruch werden quoted', () => {
    const result = toCsv(['Notiz'], [['Zeile1\nZeile2']]);
    expect(result).toContain('"Zeile1\nZeile2"');
  });

  it('Felder mit \\r\\n werden quoted und Inhalt bleibt erhalten', () => {
    const result = toCsv(['Notiz'], [['A\r\nB']]);
    expect(result).toContain('"A\r\nB"');
  });

  it('null-Werte werden als leerer String ausgegeben', () => {
    const result = toCsv(['Quote'], [[null]]);
    // BOM + "Quote\r\n" + "\r\n" (leeres Feld)
    const lines = result.slice(1).split('\r\n');
    expect(lines[1]).toBe('');
  });

  it('Zahlen werden als String ausgegeben', () => {
    const result = toCsv(['Anzahl'], [[42]]);
    const lines = result.slice(1).split('\r\n');
    expect(lines[1]).toBe('42');
  });

  it('mehrere Spalten und Zeilen korrekt', () => {
    const headers = ['Job', 'Status', 'Bewerbungen'];
    const rows = [
      ['Vertriebsprofi', 'active', 10],
      ['Manager', 'inactive', 0],
    ];
    const result = toCsv(headers, rows);
    const lines = result.slice(1).split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('Job;Status;Bewerbungen');
    expect(lines[1]).toBe('Vertriebsprofi;active;10');
    expect(lines[2]).toBe('Manager;inactive;0');
  });

  it('vollständiger Export-Header für Job-Statistiken', () => {
    const result = toCsv(
      ['Job', 'Status', 'Bewerbungen', 'Antwortquote', 'Qualifiziert', 'Termine', 'Einstellungen'],
      [],
    );
    expect(result.slice(1)).toMatch(/^Job;Status;Bewerbungen;Antwortquote;Qualifiziert;Termine;Einstellungen\r\n$/);
  });

  it('kein unnötiges Quoting bei normalem Text', () => {
    const result = toCsv(['Titel'], [['Vertriebsmitarbeiter']]);
    const lines = result.slice(1).split('\r\n');
    expect(lines[1]).toBe('Vertriebsmitarbeiter');
    expect(lines[1]).not.toContain('"');
  });
});

describe('formatPercent', () => {
  it('null ergibt leeren String', () => {
    expect(formatPercent(null)).toBe('');
  });

  it('0 → "0,0 %"', () => {
    expect(formatPercent(0)).toBe('0,0 %');
  });

  it('1.0 → "100,0 %"', () => {
    expect(formatPercent(1.0)).toBe('100,0 %');
  });

  it('0.75 → "75,0 %"', () => {
    expect(formatPercent(0.75)).toBe('75,0 %');
  });

  it('0.333 → "33,3 %"', () => {
    expect(formatPercent(1 / 3)).toBe('33,3 %');
  });

  it('0.666… → "66,7 %"', () => {
    expect(formatPercent(2 / 3)).toBe('66,7 %');
  });

  it('Dezimaltrennzeichen ist Komma (deutsches Format)', () => {
    const result = formatPercent(0.5);
    expect(result).toBe('50,0 %');
    expect(result).not.toContain('.');
  });
});
