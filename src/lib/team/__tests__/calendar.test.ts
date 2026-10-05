import { describe, it, expect } from 'vitest';
import { buildCalendar, berlinDay } from '../calendar';

describe('buildCalendar', () => {
  const users = new Map([['u1', 'Nils Berger']]);
  const agencies = new Map([['a1', 'B&C Direct Sales']]);

  it('führt Termine und Fristen zusammen, Termine mit Uhrzeit zuerst', () => {
    const out = buildCalendar(
      {
        termine: [{ id: 't1', agency_id: 'a1', candidate_id: 'c1', event_name: 'Erstgespräch', event_type: null, start_time: '2026-10-05T08:00:00Z', end_time: '2026-10-05T08:30:00Z', invitee_name: 'Max' }],
        schritte: [{ id: 's1', agency_id: 'a1', step_key: 'z_vertrag', owner_user_id: 'u1', faellig_am: '2026-10-05' }],
        ads: [],
        projekt: [{ id: 'p1', agency_id: null, titel: 'Skript', owner_user_id: 'unbekannt', faellig_am: '2026-10-01' }],
        intern: [],
      },
      users,
      agencies,
      '2026-10-03',
    );
    expect(out.map((e) => e.id)).toEqual(['projekt-p1', 'termin-t1', 'schritt-s1']);
    expect(out[1]).toMatchObject({ tag: '2026-10-05', untertitel: 'Max · B&C Direct Sales', href: '/candidates/c1' });
    expect(out[2]).toMatchObject({ titel: 'Vertrag unterschrieben', personen: [{ id: 'u1', name: 'Nils Berger' }], ueberfaellig: false });
    expect(out[0]).toMatchObject({ ueberfaellig: true, personen: [] });
  });

  it('bestimmt den Tag in Berliner Zeit', () => {
    expect(berlinDay('2026-10-05T22:30:00Z')).toBe('2026-10-06');
  });
});
