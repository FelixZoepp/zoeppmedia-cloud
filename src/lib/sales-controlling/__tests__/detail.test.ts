import { describe, it, expect } from 'vitest';
import { berechneDetails, type Anruf } from '../detail';
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
  id, lead_id: `l-${id}`, status_id: status, value: 6000, date_created: created, date_won: null, user_id: 'u1', ...extra,
});
const ev = (o: string, from: string, to: string, date: string): StatusEvent => ({ opportunity_id: o, old_status_id: from, new_status_id: to, date, user_id: 'u1' });
const call = (lead: string, date: string, disposition: string, duration = 0): Anruf => ({
  lead_id: `l-${lead}`, user_id: 'u1', direction: 'outbound', disposition, status: 'completed', duration, date,
});

const jetzt = new Date('2026-10-16T12:00:00Z');
const opps = [
  opp('a', 'won', '2026-10-01T08:00:00Z', { date_won: '2026-10-10' }),
  opp('b', 'sfu', '2026-10-02T08:00:00Z'),
  opp('c', 'st', '2026-10-05T08:00:00Z'),
];
const events = [
  ev('a', 'st', 'ct', '2026-10-03T10:00:00Z'),
  ev('a', 'ct', 'won', '2026-10-10T10:00:00Z'),
  ev('b', 'st', 'sns', '2026-10-03T10:00:00Z'),
  ev('b', 'sns', 'st', '2026-10-04T10:00:00Z'),
  ev('b', 'st', 'sfu', '2026-10-06T10:00:00Z'),
];
const anrufe = [
  call('a', '2026-10-01T08:30:00Z', 'no-answer'),
  call('a', '2026-10-01T09:10:00Z', 'answered', 300),
  call('b', '2026-10-02T13:00:00Z', 'vm-left', 20),
  call('b', '2026-10-02T14:00:00Z', 'answered', 10),
  { ...call('b', '2026-10-03T09:00:00Z', 'answered', 120), direction: 'inbound' },
];
const r = berechneDetails({
  statuses, opps, events, anrufe,
  aufgaben: [
    { lead_id: 'l-b', lead_name: 'Beta', assigned_to: 'u1', due_date: '2026-10-12', text: 'Nachfassen' },
    { lead_id: 'l-b', lead_name: 'Beta', assigned_to: 'u1', due_date: '2026-10-16', text: 'Anrufen' },
  ],
  users: new Map([['u1', 'Felix']]),
  zeitraum: { von: '2026-10-01', bis: '2026-11-01' },
  jetzt,
});

describe('Telefonie', () => {
  it('zählt nur ausgehende Anwahlen und Gespräche ab 30 Sekunden', () => {
    expect(r.telefonie).toMatchObject({
      anwahlen: 4, gespraeche: 1, kurzgespraeche: 1, mailbox: 1, nichtErreicht: 1, erreichbarkeit: 25,
      gespraechsMinuten: 5, leadsAngerufen: 2, anwahlenBisGespraech: 2,
    });
    // Deal c wurde nie angerufen, a nach 30 Min., b nach 5 Std. → Median 165 Min.
    expect(r.telefonie.neueDealsOhneAnwahl).toBe(1);
    expect(r.telefonie.speedToLeadMedianMin).toBe(165);
  });
  it('Erreichbarkeit nach Uhrzeit (Berlin)', () => {
    const elf = r.telefonie.stunden.find((s) => s.stunde === 11)!; // 09:10 UTC = 11:10 Berlin
    expect(elf).toMatchObject({ anwahlen: 1, gespraeche: 1, quote: 100 });
  });
});

describe('Show-Quoten, Follow-ups, Durchlauf', () => {
  it('Setting-No-Show wird wieder terminiert → Rückholung', () => {
    // a, b, c als Setting angelegt + b nach No-Show neu terminiert
    expect(r.shows.setting).toMatchObject({ gebucht: 4, noShow: 1, gehalten: 2 });
    expect(r.shows.rückholungSetting).toMatchObject({ noShows: 1, wiederTerminiert: 1, quote: 100 });
  });
  it('Follow-up-Bestand und Aufgaben', () => {
    expect(r.followups.bestand.find((b) => b.stufe === 'setting_followup')).toMatchObject({ anzahl: 1, schnittTage: 10 });
    expect(r.followups.aufgaben).toMatchObject({ offen: 2, ueberfaellig: 1, heute: 1, dealsOhneAufgabe: 1 });
    expect(r.followups.aufgaben.ueberfaelligListe[0]).toMatchObject({ lead: 'Beta', tageUeber: 4 });
  });
  it('Durchlaufzeit Closing → Abschluss', () => {
    expect(r.durchlauf.closingAbschluss.faelle).toBe(1);
    expect(r.durchlauf.closingAbschluss.tage).toBeCloseTo(6.6, 0);
  });
});
