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
    expect(regelnFollowUp({ [F.erreicht]: 'Ja', [F.ergebnis]: 'Abgeschlossen' }, jetzt)).toEqual({ abgeschlossen: true });
  });
});

describe('regelnFollowUp – Erstgespräch gelegt', () => {
  it('setzt die Opportunity zurück auf Setting – Terminiert, ohne Sperre', () => {
    const F = FOLLOWUP_FELDER_IDS;
    expect(regelnFollowUp({ [F.erreicht]: 'Ja', [F.ergebnis]: 'Erstgespräch gelegt', [F.kalender]: '2026-10-12T09:00:00Z' }, new Date('2026-10-09T10:00:00Z'))).toEqual({
      settingTerminiert: true,
      termin: '2026-10-12T09:00:00Z',
    });
  });
});

describe('regelnFollowUp – Beratungsgespräch gelegt', () => {
  it('setzt die Opportunity auf Closing – Terminiert', () => {
    const F = FOLLOWUP_FELDER_IDS;
    expect(regelnFollowUp({ [F.erreicht]: 'Ja', [F.ergebnis]: 'Beratungsgespräch gelegt', [F.kalender]: '2026-10-14T13:00:00Z' }, new Date('2026-10-09T10:00:00Z'))).toEqual({
      closingTerminiert: true,
      termin: '2026-10-14T13:00:00Z',
    });
  });
});

describe('Abschluss', () => {
  it('Closing-Protokoll „1. Abgeschlossen“ → Kunde + gewonnen', async () => {
    const { regelnClosing, CLOSING_FELDER } = await import('../protokolle');
    expect(regelnClosing({ [CLOSING_FELDER.naechsterSchritt]: '1. Abgeschlossen' })).toEqual({ abgeschlossen: true });
    expect(regelnClosing({})).toEqual({});
  });

  it('Follow-up „Abgeschlossen“ → Kunde + gewonnen', () => {
    expect(regelnFollowUp({ [FOLLOWUP_FELDER_IDS.ergebnis]: 'Abgeschlossen' }, jetzt)).toEqual({ abgeschlossen: true });
  });
});

describe('Closing-Ergebnisse', () => {
  it('ordnet alle Schritte zu', async () => {
    const { regelnClosing, CLOSING_FELDER: C } = await import('../protokolle');
    const r = (v: string, k: string | null = null) => regelnClosing({ [C.naechsterSchritt]: v, [C.kalender]: k }, jetzt);
    expect(r('2. Angebot versendet')).toEqual({ oppStatus: 'angebot', angebotNachfassen: true });
    expect(r('3. Unqualifiziert')).toMatchObject({ leadStatus: 'unqualifiziert', oppsVerloren: true, gesperrtBis: '2027-01-08T10:00:00.000Z' });
    expect(r('4. Disqualifiziert')).toEqual({ leadStatus: 'disqualifiziert', oppsVerloren: true });
    expect(r('5. CC2 vereinbart am:', '2026-10-15T08:00:00Z')).toEqual({ oppStatus: 'cc2', termin: '2026-10-15T08:00:00Z' });
    expect(r('6. No-Show')).toEqual({ oppStatus: 'closing_no_show' });
    expect(r('7. Verschoben auf:')).toEqual({ oppStatus: 'closing_terminiert', termin: null });
    expect(r('8. Verloren')).toEqual({ oppsVerloren: true });
  });
});

describe('regelnSetting – Unqualifiziert mit Rückruf', () => {
  it('sperrt bis zum Rückruf und legt eine Rückruf-Aufgabe an', async () => {
    const { regelnSetting, SETTING_FELDER: S } = await import('../protokolle');
    const a = regelnSetting({ [S.ergebnis]: 'Unqualifiziert', [S.kalender]: '2027-01-13T09:30:00Z', [S.grund]: 'Kein Budget / nicht liquide (GS 2)' }, new Date('2026-10-15T09:12:00Z'));
    expect(a.gesperrtBis).toBe('2027-01-13T09:30:00.000Z');
    expect(a.rueckruf?.datum).toBe('2027-01-13');
    expect(a.rueckruf?.text).toContain('10:30 Uhr');
    expect(a.rueckruf?.text).toContain('Kein Budget');
    expect(a.leadStatus).toBeUndefined();
  });
  it('ohne Kalender, mit vergangenem Datum oder anderem Ergebnis: nichts', async () => {
    const { regelnSetting, SETTING_FELDER: S } = await import('../protokolle');
    const jetzt = new Date('2026-10-15T09:12:00Z');
    expect(regelnSetting({ [S.ergebnis]: 'Unqualifiziert' }, jetzt)).toEqual({});
    expect(regelnSetting({ [S.ergebnis]: 'Unqualifiziert', [S.kalender]: '2026-10-01T09:00:00Z' }, jetzt)).toEqual({});
    expect(regelnSetting({ [S.ergebnis]: 'Beratungsgespräch gelegt', [S.kalender]: '2026-10-20T09:00:00Z' }, jetzt)).toEqual({});
  });
});

describe('verlustgrundAusProtokoll', () => {
  it('nimmt den Grund nur, wenn das Protokoll ihn nennt', async () => {
    const { verlustgrundAusProtokoll, SETTING_FELDER: S } = await import('../protokolle');
    expect(verlustgrundAusProtokoll('setting', { [S.ergebnis]: 'Unqualifiziert', [S.grund]: 'Kein Budget / nicht liquide (GS 2)' })).toBe('Kein Budget / nicht liquide (GS 2)');
    expect(verlustgrundAusProtokoll('setting', { [S.ergebnis]: 'Disqualifiziert', [S.grund]: 'Respektlos (GS 5)' })).toBe('Respektlos (GS 5)');
    expect(verlustgrundAusProtokoll('setting', { [S.ergebnis]: 'Beratungsgespräch gelegt', [S.grund]: 'Respektlos (GS 5)' })).toBeNull();
    expect(verlustgrundAusProtokoll('follow_up', { [FOLLOWUP_FELDER_IDS.ergebnis]: 'Verloren', [FOLLOWUP_FELDER_IDS.verlorenGrund]: 'Entscheider fehlt (GS 3)' })).toBe('Entscheider fehlt (GS 3)');
    expect(verlustgrundAusProtokoll('follow_up', { [FOLLOWUP_FELDER_IDS.ergebnis]: 'Verloren' })).toBeNull();
    expect(verlustgrundAusProtokoll('terminierung', { [F.ergebnis]: 'Unqualifiziert', [F.einwand]: 'Kein Budget' })).toBe('Kein Budget / nicht liquide (GS 2)');
    expect(verlustgrundAusProtokoll('terminierung', { [F.ergebnis]: 'Unqualifiziert', [F.einwand]: 'Keine Zeit' })).toBeNull();
    expect(verlustgrundAusProtokoll('closing', {})).toBeNull();
    expect(verlustgrundAusProtokoll('setting', { [S.ergebnis]: 'Unqualifiziert', [S.grund]: 'Erfunden' })).toBeNull();
  });
});
