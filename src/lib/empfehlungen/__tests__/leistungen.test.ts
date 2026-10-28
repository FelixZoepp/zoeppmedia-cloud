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

import { kundenEmpfehlungen } from '../leistungen';

describe('kundenEmpfehlungen', () => {
  const e = (id: string, prio: number) => ({ id, art: 'leistung' as const, titel: '', warum: `wegen ${id}`, nutzen: '', prio });

  it('höchstens zwei Maßnahmen, wichtigste zuerst, keine Pakete', () => {
    const k = kundenEmpfehlungen(lage, [e('leistung_growth', 1), e('leistung_imagefilm', 3), e('leistung_workshop', 2), e('leistung_prozess', 1)]);
    expect(k.map((x) => x.id)).toEqual(['leistung_prozess', 'leistung_workshop']);
  });

  it('ohne passende Regel genau eine konkrete Maßnahme: Karriere-Website', () => {
    const k = kundenEmpfehlungen(lage, []);
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ id: 'leistung_karriereseite', empfohlen: true });
    expect(k[0].warum).toBeTruthy();
  });

  it('hat der Kunde schon eine Karriereseite, kommt der Imagefilm', () => {
    expect(kundenEmpfehlungen({ ...lage, karriereseite: true }, []).map((x) => x.id)).toEqual(['leistung_imagefilm']);
  });
});
