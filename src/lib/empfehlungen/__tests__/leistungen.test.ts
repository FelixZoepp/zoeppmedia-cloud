import { describe, it, expect } from 'vitest';
import { freischaltKarten } from '../leistungen';
import type { KundenLage } from '../regeln';

const lage = { paket: 'starter', karriereseite: false, personaFreigeschaltet: false } as KundenLage;

describe('freischaltKarten', () => {
  it('zeigt gesperrte Leistungen, empfohlene zuerst mit Begründung', () => {
    const k = freischaltKarten(lage, [{ id: 'leistung_workshop', art: 'leistung', titel: '', warum: 'Hohe No-Show-Quote', nutzen: '', prio: 2 }]);
    expect(k[0]).toMatchObject({ id: 'leistung_workshop', empfohlen: true, warum: 'Hohe No-Show-Quote' });
    expect(k.map((x) => x.id)).toEqual(expect.arrayContaining(['leistung_persona', 'leistung_growth', 'leistung_scale', 'leistung_karriereseite']));
    expect(k.every((x) => x.vorteile.length >= 4 && x.beispiel.kennzahl)).toBe(true);
  });
  it('blendet aus, was der Kunde schon hat', () => {
    const ids = freischaltKarten({ ...lage, paket: 'scale', personaFreigeschaltet: true }, []).map((x) => x.id);
    expect(ids).not.toContain('leistung_persona');
    expect(ids).not.toContain('leistung_growth');
    expect(ids).not.toContain('leistung_scale');
    expect(ids).not.toContain('leistung_karriereseite');
  });
});
