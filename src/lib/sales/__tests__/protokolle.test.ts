import { describe, expect, it } from 'vitest';
import { FOLLOWUP_FELDER_IDS, regelnFollowUp, regelnTerminierung, TERMINIERUNG_FELDER as F } from '../protokolle';

const jetzt = new Date('2026-10-08T10:00:00Z');
const r = (f: Record<string, string | null>) => regelnTerminierung(f, jetzt);

describe('regelnTerminierung', () => {
  it('Niemand / Mailbox → 1 Tag gesperrt', () => {
    expect(r({ [F.wenErreicht]: 'Niemand / Mailbox' })).toEqual({ gesperrtBis: '2026-10-09T10:00:00.000Z' });
  });

  it('Gatekeeper → bis Kalender, sonst 1 Tag; Handy bekommen sperrt nicht', () => {
    expect(r({ [F.wenErreicht]: 'Gatekeeper / Assistenz', [F.gatekeeperErgebnis]: 'Rückruf vereinbart am:', [F.kalender]: '2026-10-12T09:00:00Z' })).toMatchObject({
      gesperrtBis: '2026-10-12T09:00:00.000Z',
    });
    expect(r({ [F.wenErreicht]: 'Gatekeeper / Assistenz', [F.gatekeeperErgebnis]: 'Abgeblockt' })).toEqual({ gesperrtBis: '2026-10-09T10:00:00.000Z', termin: null });
    expect(r({ [F.wenErreicht]: 'Gatekeeper / Assistenz', [F.gatekeeperErgebnis]: 'Handy/Durchwahl bekommen' })).toEqual({});
  });

  it('Kein Interesse 3M / 6M → 3 bzw. 6 Monate gesperrt', () => {
    expect(r({ [F.wenErreicht]: 'Lead', [F.ergebnis]: 'Kein Interesse - 3M' }).gesperrtBis).toBe('2027-01-08T10:00:00.000Z');
    expect(r({ [F.wenErreicht]: 'Lead', [F.ergebnis]: 'Kein Interesse - 6M' }).gesperrtBis).toBe('2027-04-08T10:00:00.000Z');
  });

  it('Rückruf → bis Kalender (vergangener Kalender → 1 Tag)', () => {
    expect(r({ [F.ergebnis]: 'Rückruf vereinbart am:', [F.kalender]: '2026-10-10T08:00:00Z' }).gesperrtBis).toBe('2026-10-10T08:00:00.000Z');
    expect(r({ [F.ergebnis]: 'Rückruf vereinbart am:', [F.kalender]: '2026-10-01T08:00:00Z' }).gesperrtBis).toBe('2026-10-09T10:00:00.000Z');
  });

  it('Setting vereinbart → Status Setting + Opportunity, keine Sperre', () => {
    expect(r({ [F.wenErreicht]: 'Lead', [F.ergebnis]: 'Setting vereinbart am:', [F.kalender]: '2026-10-09T08:30:00Z' })).toEqual({
      leadStatus: 'setting',
      settingOpportunity: true,
      termin: '2026-10-09T08:30:00Z',
    });
  });

  it('Unqualifiziert (3 Monate gesperrt) / Bad Data → Status + offene Opportunities verloren', () => {
    expect(r({ [F.ergebnis]: 'Unqualifiziert' })).toEqual({ leadStatus: 'unqualifiziert', oppsVerloren: true, gesperrtBis: '2027-01-08T10:00:00.000Z' });
    expect(r({ [F.ergebnis]: 'Bad Data / Falsche Nummer' })).toEqual({ leadStatus: 'bad_data', oppsVerloren: true });
  });
});

describe('regelnFollowUp', () => {
  const jetzt = new Date('2026-10-09T10:00:00Z');
  const F = FOLLOWUP_FELDER_IDS;
  it('nicht erreicht → 1 Tag gesperrt', () => {
    expect(regelnFollowUp({ [F.erreicht]: 'Nein / Mailbox' }, jetzt)).toEqual({ gesperrtBis: '2026-10-10T10:00:00.000Z' });
    expect(regelnFollowUp({ [F.ergebnis]: 'Nicht erreicht' }, jetzt)).toEqual({ gesperrtBis: '2026-10-10T10:00:00.000Z' });
  });
  it('nicht erreicht mit Kalender → bis Kalender', () => {
    expect(regelnFollowUp({ [F.erreicht]: 'Nein / Mailbox', [F.kalender]: '2026-10-13T08:00:00Z' }, jetzt)).toEqual({ gesperrtBis: '2026-10-13T08:00:00.000Z' });
  });
  it('weiter Follow-up mit Kalender → bis Kalender, ohne Kalender keine Sperre', () => {
    expect(regelnFollowUp({ [F.erreicht]: 'Ja', [F.ergebnis]: 'Weiter Follow-up', [F.kalender]: '2026-10-15T08:00:00Z' }, jetzt)).toEqual({ gesperrtBis: '2026-10-15T08:00:00.000Z' });
    expect(regelnFollowUp({ [F.erreicht]: 'Ja', [F.ergebnis]: 'Weiter Follow-up' }, jetzt)).toEqual({});
    expect(regelnFollowUp({ [F.erreicht]: 'Ja', [F.ergebnis]: 'Erstgespräch gelegt' }, jetzt)).toEqual({});
  });
});
