import { describe, it, expect } from 'vitest';
import { berechneEmpfehlungen, type KundenLage } from '../regeln';

const basis: KundenLage = {
  paket: 'starter', phase: 'continuity', bewerber30: 40, bewerberVorher: 30, bewerber7: 8, offen: 30, ohneKontakt: 12,
  kontaktquote: 50, speedToLeadMin: 240, anrufe30: 50, erreichbarkeit: 40, termine30: 8, noShows30: 3, einstellungen30: 0,
  whatsappVerbunden: false, karriereseite: false, masterclassFortschritt: 20, personaFreigeschaltet: false, personaTests30: 0,
};

describe('berechneEmpfehlungen', () => {
  it('leitet Tipps und Leistungen aus den Zahlen ab, wichtigste zuerst', () => {
    const r = berechneEmpfehlungen(basis);
    const ids = r.map((x) => x.id);
    expect(ids[0]).toBe('tipp_anrufen');
    expect(ids).toEqual(expect.arrayContaining(['tipp_speed', 'tipp_whatsapp', 'tipp_noshow', 'tipp_masterclass', 'leistung_prozess', 'leistung_workshop', 'leistung_karriereseite', 'leistung_growth', 'leistung_persona']));
    expect(ids).not.toContain('leistung_budget');
    expect(r.find((x) => x.id === 'tipp_speed')!.warum).toContain('4 Stunden');
  });
  it('empfiehlt mehr Reichweite, wenn die Kampagne läuft, aber keine Bewerber kommen', () => {
    const r = berechneEmpfehlungen({ ...basis, bewerber7: 0, ohneKontakt: 0, offen: 0 });
    expect(r[0]).toMatchObject({ id: 'leistung_budget', art: 'leistung' });
  });
  it('keine Empfehlungen ohne Anlass', () => {
    const r = berechneEmpfehlungen({ ...basis, paket: 'scale', ohneKontakt: 0, offen: 2, speedToLeadMin: 10, whatsappVerbunden: true, noShows30: 0, masterclassFortschritt: 90, karriereseite: true, kontaktquote: 95, einstellungen30: 1, personaFreigeschaltet: true, personaTests30: 5 });
    expect(r).toEqual([]);
  });
  it('Persona-Test: Leistung, solange nicht freigeschaltet; Tipp, wenn freigeschaltet aber kaum genutzt', () => {
    const gesperrt = berechneEmpfehlungen(basis).find((x) => x.id === 'leistung_persona');
    expect(gesperrt).toMatchObject({ art: 'leistung', prio: 2 });
    expect(gesperrt!.warum).toContain('40 Bewerber');
    const frei = berechneEmpfehlungen({ ...basis, personaFreigeschaltet: true, personaTests30: 1 }).map((x) => x.id);
    expect(frei).toContain('tipp_persona');
    expect(frei).not.toContain('leistung_persona');
    expect(berechneEmpfehlungen({ ...basis, personaFreigeschaltet: false, bewerber30: 5 }).map((x) => x.id)).not.toContain('leistung_persona');
  });
});
