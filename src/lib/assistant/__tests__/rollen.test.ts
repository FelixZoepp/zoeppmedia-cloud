import { describe, it, expect } from 'vitest';
import { toolsFor } from '../tools';
import { systemPromptFor } from '../prompt';

const namen = (xs: ReturnType<typeof toolsFor>) => xs.map((t) => t.tool.name).sort();

describe('KI-Assistent: Werkzeuge je Rolle', () => {
  it('Kunde bekommt nur Werkzeuge für die eigene Agentur – nichts Internes', () => {
    const k = namen(toolsFor('kunde'));
    expect(k).toEqual(['bewerber_suchen', 'deine_aufgaben', 'empfehlungen', 'hilfe_suchen', 'interesse_melden', 'meine_ergebnisse', 'recruiting_zahlen'].sort());
    for (const intern of ['kunden_ergebnisse', 'kunden_uebersicht', 'team_auslastung', 'sales_kennzahlen', 'innendienst_arbeit', 'kunden_chancen', 'meine_aufgaben', 'team_kalender']) {
      expect(k).not.toContain(intern);
    }
  });
  it('Admin bekommt Steuerungs-Werkzeuge', () => {
    expect(namen(toolsFor('admin'))).toEqual(expect.arrayContaining(['sales_kennzahlen', 'kunden_ergebnisse', 'kunden_chancen', 'team_auslastung', 'innendienst_arbeit']));
  });
  it('Mitarbeiter je Bereich', () => {
    expect(namen(toolsFor('team', 'innendienst'))).toEqual(expect.arrayContaining(['innendienst_arbeit', 'kunden_ergebnisse']));
    expect(namen(toolsFor('team', 'innendienst'))).not.toContain('sales_kennzahlen');
    expect(namen(toolsFor('team', 'csm'))).toEqual(expect.arrayContaining(['kunden_chancen', 'kunden_ergebnisse']));
    expect(namen(toolsFor('team', 'closer'))).toContain('sales_kennzahlen');
    expect(namen(toolsFor('team', 'media_buyer'))).not.toContain('kunden_ergebnisse');
  });
  it('Innendienst in einer Kunden-Cloud bekommt die Kunden-Werkzeuge dazu', () => {
    expect(namen(toolsFor('team', 'innendienst', true))).toEqual(expect.arrayContaining(['meine_ergebnisse', 'bewerber_suchen']));
  });
});

describe('KI-Assistent: Regeln im Prompt', () => {
  it('Kunden-Prompt verbietet Auskünfte über andere Kunden und Preise', () => {
    const p = systemPromptFor('kunde', 'Cihan Turhan');
    expect(p).toContain('Über andere Kunden');
    expect(p).toContain('Keine Preise');
    expect(p).toContain('interesse_melden');
  });
  it('Interne Prompts nennen den Bereich', () => {
    expect(systemPromptFor('team', 'Lea Hoff', 'innendienst')).toContain('Bereich Innendienst');
    expect(systemPromptFor('admin', 'Felix Zoepp')).toContain('Admin');
  });
});
