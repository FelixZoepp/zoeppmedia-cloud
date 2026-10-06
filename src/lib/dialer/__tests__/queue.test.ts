import { describe, it, expect } from 'vitest';
import { anrufbar, baueWarteschlange, offeneRueckrufe, queueStats, type QueueCandidate } from '../queue';

const jetzt = new Date('2026-10-06T10:00:00Z');
const k = (id: string, extra: Partial<QueueCandidate> = {}): QueueCandidate => ({
  id,
  name: `Bewerber ${id}`,
  phone: '+49151000000',
  agency_id: 'a1',
  created_at: '2026-10-05T08:00:00Z',
  ...extra,
});

describe('anrufbar', () => {
  it('überspringt fehlende Nummer, Blacklist, gelöscht und „nicht kontaktieren“', () => {
    expect(anrufbar(k('1'), 'u1', jetzt)).toBe(true);
    expect(anrufbar(k('2', { phone: null }), 'u1', jetzt)).toBe(false);
    expect(anrufbar(k('3', { phone: '  ' }), 'u1', jetzt)).toBe(false);
    expect(anrufbar(k('4', { blacklisted: true }), 'u1', jetzt)).toBe(false);
    expect(anrufbar(k('5', { deleted_at: '2026-10-01' }), 'u1', jetzt)).toBe(false);
    expect(anrufbar(k('6', { do_not_contact: true }), 'u1', jetzt)).toBe(false);
  });

  it('gesperrt nur, wenn jemand anderes ihn gerade offen hat', () => {
    const bald = '2026-10-06T10:05:00Z';
    expect(anrufbar(k('1', { locked_by: 'u2', locked_until: bald }), 'u1', jetzt)).toBe(false);
    expect(anrufbar(k('1', { locked_by: 'u1', locked_until: bald }), 'u1', jetzt)).toBe(true);
    expect(anrufbar(k('1', { locked_by: 'u2', locked_until: '2026-10-06T09:59:00Z' }), 'u1', jetzt)).toBe(true);
  });
});

describe('offeneRueckrufe', () => {
  it('zählt nur den jeweils letzten Anruf-Log', () => {
    const cbs = [
      { id: 'l1', candidate_id: 'c1', agency_id: 'a1', notes: null, next_contact_date: '2026-10-06' },
      { id: 'l2', candidate_id: 'c2', agency_id: 'a1', notes: null, next_contact_date: '2026-10-06' },
    ];
    expect(offeneRueckrufe(cbs, { c1: 'l1', c2: 'l9' }).map((c) => c.id)).toEqual(['l1']);
  });
});

describe('baueWarteschlange', () => {
  it('Priorität Erinnerung > Kadenz > Rückruf > Neu, ohne Doppelte, Gesperrte raus', () => {
    const items = baueWarteschlange({
      reminders: [{ id: 'ap1', candidate_id: 'c1', agency_id: 'a1', type: 'probetag', scheduled_at: '2026-10-06T15:00:00Z' }],
      cadence: [k('c1', { cadence_attempt: 2 }), k('c2', { cadence_attempt: 1, cadence_next_window: 'morning' })],
      callbacks: [{ id: 'l1', candidate_id: 'c3', agency_id: 'a1', notes: 'Ab 17 Uhr', next_contact_date: '2026-10-06' }],
      neue: [k('c2'), k('c4'), k('c5', { locked_by: 'u2', locked_until: '2026-10-06T10:08:00Z' }), k('c6', { phone: null })],
      kandidaten: { c1: k('c1'), c3: k('c3') },
      userId: 'u1',
      jetzt,
    });
    expect(items.map((i) => [i.candidate_id, i.reason])).toEqual([
      ['c1', 'erinnerung'],
      ['c2', 'kadenz'],
      ['c3', 'rueckruf'],
      ['c4', 'neu'],
    ]);
    expect(items[0]).toMatchObject({ appointment_type: 'probetag', appointment_id: 'ap1' });
    expect(items[1]).toMatchObject({ cadence_attempt: 1, cadence_window: 'morning' });
    expect(items[2]).toMatchObject({ callback_note: 'Ab 17 Uhr' });
    expect(queueStats(items)).toEqual({ total: 4, erinnerungen: 1, kadenz: 1, rueckrufe: 1, neue: 1 });
  });

  it('Erinnerung ohne Bewerber-Daten fällt weg', () => {
    const items = baueWarteschlange({
      reminders: [{ id: 'ap1', candidate_id: 'cX', agency_id: 'a1', type: 'vorstellungsgespraech', scheduled_at: '2026-10-06T15:00:00Z' }],
      cadence: [],
      callbacks: [],
      neue: [],
      kandidaten: {},
      userId: 'u1',
      jetzt,
    });
    expect(items).toEqual([]);
  });
});
