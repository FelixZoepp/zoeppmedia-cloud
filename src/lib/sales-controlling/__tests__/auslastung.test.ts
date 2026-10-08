import { describe, it, expect } from 'vitest';
import { ampelClosing, ampelSetting, berechneAuslastung, letzteWerktage, schwellenAus, STANDARD_SCHWELLEN, werktageListe, type AuslastungEingaben } from '../auslastung';
import type { Anruf } from '../detail';
import type { Opp, StatusEvent } from '../compute';

const statuses = [
  { id: 'st', label: 'Setting - Terminiert', type: 'active' },
  { id: 'sns', label: 'Setting - No Show', type: 'active' },
  { id: 'sfu', label: 'Setting - Follow Up', type: 'active' },
  { id: 'ct', label: 'Closing - Terminiert', type: 'active' },
  { id: 'cns', label: 'Closing - No Show', type: 'active' },
  { id: 'cfu', label: 'Closing - Follow Up', type: 'active' },
  { id: 'ang', label: 'Angebot verschickt', type: 'active' },
  { id: 'cc2', label: 'CC2 - Terminiert', type: 'active' },
  { id: 'won', label: 'Close', type: 'won' },
  { id: 'lost', label: 'Verloren', type: 'lost' },
];
const opp = (id: string, status: string, created: string, extra: Partial<Opp> = {}): Opp => ({
  id, lead_id: `l-${id}`, lead_name: `Lead ${id.toUpperCase()}`, status_id: status, value: 6000, date_created: created, date_won: null, user_id: 'u1', ...extra,
});
const ev = (o: string, from: string, to: string, date: string, user = 'u1'): StatusEvent => ({ opportunity_id: o, old_status_id: from, new_status_id: to, date, user_id: user });
const call = (lead: string, date: string, user = 'u1', disposition = 'no-answer', duration = 0): Anruf => ({
  lead_id: `l-${lead}`, user_id: user, direction: 'outbound', disposition, status: 'completed', duration, date,
});

const users = new Map([['u1', 'Sina Setter'], ['u2', 'Carl Closer'], ['u3', 'Rita Rückholer']]);
const jetzt = new Date('2026-10-16T12:00:00Z'); // Freitag

function eingaben(extra: Partial<AuslastungEingaben> = {}): AuslastungEingaben {
  return {
    statuses,
    opps: [],
    events: [],
    anrufe: [],
    aufgaben: [],
    erledigteAufgaben: [],
    users,
    zeitraum: { von: '2026-10-01', bis: '2026-11-01' },
    jetzt,
    ...extra,
  };
}

describe('Ampel-Grenzen', () => {
  it('Setter: <10 nicht ausgelastet, 10–13 okay, 14–16 optimal, 17–20 fast voll, >20 überlastet', () => {
    expect(ampelSetting(null)).toBe('leer');
    expect(ampelSetting(9)).toBe('nicht_ausgelastet');
    expect(ampelSetting(10)).toBe('okay');
    expect(ampelSetting(13)).toBe('okay');
    expect(ampelSetting(14)).toBe('optimal');
    expect(ampelSetting(15)).toBe('optimal');
    expect(ampelSetting(16)).toBe('optimal');
    expect(ampelSetting(16.5)).toBe('fast_voll');
    expect(ampelSetting(17)).toBe('fast_voll');
    expect(ampelSetting(20)).toBe('fast_voll');
    expect(ampelSetting(21)).toBe('ueberlastet');
  });

  it('Closer: <6 nicht ausgelastet, 6–7 optimal, 8–9 voll, ab 10 überlastet', () => {
    expect(ampelClosing(5)).toBe('nicht_ausgelastet');
    expect(ampelClosing(6)).toBe('optimal');
    expect(ampelClosing(7)).toBe('optimal');
    expect(ampelClosing(8)).toBe('fast_voll');
    expect(ampelClosing(9)).toBe('fast_voll');
    expect(ampelClosing(10)).toBe('ueberlastet');
  });

  it('Schwellen lassen sich über system_einstellungen überschreiben, ungültige Werte zählen nicht', () => {
    const s = schwellenAus([
      { key: 'vertrieb_setting_optimal', wert: '12' },
      { key: 'vertrieb_closing_min', wert: 'abc' },
      { key: 'fremd', wert: '99' },
    ]);
    expect(s.settingOptimal).toBe(12);
    expect(s.closingMin).toBe(STANDARD_SCHWELLEN.closingMin);
    expect(ampelSetting(12, s)).toBe('optimal');
  });
});

describe('Werktage', () => {
  it('nur Mo–Fr, höchstens bis heute', () => {
    expect(werktageListe('2026-10-09', '2026-11-01', '2026-10-13')).toEqual(['2026-10-09', '2026-10-12', '2026-10-13']);
    expect(letzteWerktage('2026-10-13', 3)).toEqual(['2026-10-09', '2026-10-12', '2026-10-13']);
  });
});

describe('Settings und Closings je Person und Tag', () => {
  const opps = [
    opp('a', 'ang', '2026-10-01T08:00:00Z'),
    opp('b', 'ct', '2026-10-01T08:00:00Z'),
    opp('c', 'won', '2026-10-01T08:00:00Z'),
  ];
  const events = [
    // Setter u1 hält am Di 13.10. zwei Settings
    ev('a', 'st', 'ct', '2026-10-13T09:00:00Z', 'u1'),
    ev('b', 'st', 'ct', '2026-10-13T11:00:00Z', 'u1'),
    // Closer u2 hält am Mi 14.10. ein Closing und ein CC2
    ev('a', 'ct', 'ang', '2026-10-14T10:00:00Z', 'u2'),
    ev('c', 'st', 'cc2', '2026-10-12T10:00:00Z', 'u1'),
    ev('c', 'cc2', 'won', '2026-10-14T15:00:00Z', 'u2'),
  ];
  const a = berechneAuslastung(eingaben({ opps, events }));

  it('zählt gehaltene Settings beim Setter am richtigen Tag', () => {
    const sina = a.setter.find((s) => s.name === 'Sina Setter')!;
    expect(sina.summeSettings).toBe(3); // 2× st→ct am 13., 1× st→cc2 am 12.
    expect(sina.settings[a.tage.indexOf('2026-10-13')]).toBe(2);
    expect(sina.settings[a.tage.indexOf('2026-10-12')]).toBe(1);
  });

  it('zählt Closings inkl. CC2 beim Closer', () => {
    const carl = a.closer.find((c) => c.name === 'Carl Closer')!;
    expect(carl.summeClosings).toBe(2);
    expect(carl.closings[a.tage.indexOf('2026-10-14')]).toBe(2);
    expect(carl.ampel).toBe('nicht_ausgelastet');
  });
});

describe('Setting-Follow-up-Anwahlen per Status-Rekonstruktion', () => {
  const opps = [opp('b', 'sfu', '2026-10-01T08:00:00Z')];
  const events = [ev('b', 'st', 'sfu', '2026-10-06T10:00:00Z')];
  const anrufe = [
    call('b', '2026-10-05T09:00:00Z'), // noch „Setting terminiert“ → kein Follow-up
    call('b', '2026-10-07T09:00:00Z'), // im Follow-up
    call('b', '2026-10-07T15:00:00Z', 'u1', 'answered', 120),
    call('x', '2026-10-07T09:00:00Z'), // Lead ohne Deal
  ];
  const a = berechneAuslastung(eingaben({ opps, events, anrufe }));

  it('nur Anrufe, während der Deal im Setting-Follow-up stand', () => {
    const sina = a.setter.find((s) => s.name === 'Sina Setter')!;
    expect(sina.summeFollowups).toBe(2);
    expect(sina.followups[a.tage.indexOf('2026-10-07')]).toBe(2);
    expect(sina.followupsUnterMin[a.tage.indexOf('2026-10-07')]).toBe(true);
  });

  it('Anwahl-Tabelle zählt alle Anwahlen und Gespräche je Tag', () => {
    const zeile = a.anwahlenTabelle[0];
    expect(zeile.summeAnwahlen).toBe(4);
    expect(zeile.summeGespraeche).toBe(1);
    expect(zeile.anwahlen[a.tage.indexOf('2026-10-07')]).toBe(3);
  });
});

describe('No-Show-Rückholung je Person', () => {
  const opps = [opp('b', 'st', '2026-10-01T08:00:00Z'), opp('d', 'cns', '2026-10-01T08:00:00Z')];
  const events = [
    ev('b', 'st', 'sns', '2026-10-08T10:00:00Z', 'u1'),
    ev('b', 'sns', 'st', '2026-10-09T10:00:00Z', 'u3'),
    ev('d', 'ct', 'cns', '2026-10-08T10:00:00Z', 'u3'),
  ];
  const a = berechneAuslastung(eingaben({ opps, events }));

  it('rechnet die Rückholung der Person zu, die den Lead wieder terminiert hat', () => {
    const rita = a.rueckholung.find((r) => r.name === 'Rita Rückholer')!;
    expect(rita.rueckgeholt).toBe(1);
    expect(rita.setting).toBe(1);
    expect(rita.noShows).toBe(1);
    expect(rita.quote).toBe(100);
    expect(rita.leads[0].lead).toBe('Lead B');
    const sina = a.rueckholung.find((r) => r.name === 'Sina Setter')!;
    expect(sina.rueckgeholt).toBe(0);
    expect(sina.noShows).toBe(1);
  });
});

describe('Kapazität', () => {
  const opps = [opp('a', 'ct', '2026-10-13T08:00:00Z', { status_id: 'st' }), opp('b', 'ct', '2026-10-13T08:00:00Z', { status_id: 'st' })];
  const events = [ev('a', 'st', 'ct', '2026-10-14T09:00:00Z'), ev('b', 'st', 'ct', '2026-10-15T09:00:00Z')];

  it('Ø pro Setter und Tag über 10 Werktage, optimale Anzahl = Volumen ÷ Optimum', () => {
    const a = berechneAuslastung(eingaben({ opps, events }));
    expect(a.kapazitaet.tage).toBe(10);
    expect(a.kapazitaet.setter.anzahl).toBe(1);
    expect(a.kapazitaet.setter.schnitt).toBe(0.2);
    expect(a.kapazitaet.setter.neuNoetig).toBe(false);
    // 2 gebuchte Settings (Anlage) + 2 gebuchte Closings in 10 Tagen
    expect(a.kapazitaet.setter.volumenProTag).toBe(0.2);
    expect(a.kapazitaet.closer.volumenProTag).toBe(0.2);
    expect(a.kapazitaet.setter.optimalAnzahl).toBe(0);
  });

  it('meldet neuen Setter, wenn der Schnitt über der „fast voll“-Grenze liegt', () => {
    const a = berechneAuslastung(eingaben({ opps, events, schwellen: { ...STANDARD_SCHWELLEN, settingVoll: 0.1 } }));
    expect(a.kapazitaet.setter.neuNoetig).toBe(true);
    expect(a.kapazitaet.setter.aussage).toContain('neuer Setter nötig');
  });
});
