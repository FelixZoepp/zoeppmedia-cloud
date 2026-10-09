import { describe, expect, it } from 'vitest';
import { alsCsv, alsEdl, alsFcpXml, timecode } from '../marker-export';

const k = [
  { zeit_s: 12.4, text: 'Tippfehler im Untertitel', autor: 'Felix' },
  { zeit_s: 3, zeit_bis_s: 5, text: 'Musik leiser\nab hier', autor: 'Kunde: Turhan', erledigt: true },
  { zeit_s: null, text: 'Allgemein: Farben wärmer', autor: 'Felix' },
];

describe('Marker-Export', () => {
  it('rechnet Timecodes', () => {
    expect(timecode(0, 25)).toBe('00:00:00:00');
    expect(timecode(12.4, 25)).toBe('00:00:12:10');
    expect(timecode(3600 + 61.5, 25)).toBe('01:01:01:13');
  });
  it('EDL: sortiert, mit Dauer und ohne Zeilenumbruch im Text', () => {
    const edl = alsEdl('Ad V2', k, { fps: 25, startS: 3600 });
    const zeilen = edl.split('\r\n');
    expect(zeilen[0]).toBe('TITLE: Ad V2');
    expect(zeilen[3]).toContain('01:00:03:00 01:00:03:01');
    expect(zeilen[4]).toBe(' |C:ResolveColorGreen |M:Kunde: Turhan: Musik leiser ab hier |D:50');
    expect(edl).toContain('|M:Felix: Tippfehler im Untertitel |D:1');
    expect(edl).not.toContain('Allgemein');
  });
  it('FCP-XML: Marker in Frames, Sonderzeichen maskiert', () => {
    const x = alsFcpXml('A & B', k, { fps: 25, startS: 0 }, 30);
    expect(x).toContain('<name>A &amp; B – Feedback</name>');
    expect(x).toContain('<in>75</in><out>125</out>');
    expect(x).toContain('<in>310</in><out>-1</out>');
  });
  it('CSV: allgemeine Kommentare am Ende', () => {
    const c = alsCsv(k, { fps: 25, startS: 0 }).replace('﻿', '').split('\r\n');
    expect(c[1]).toContain('00:00:03:00;00:00:05:00');
    expect(c[3]).toContain('allgemein');
  });
});
