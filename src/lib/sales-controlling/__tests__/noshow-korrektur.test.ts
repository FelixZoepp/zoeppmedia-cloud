import { describe, it, expect } from 'vitest';
import { ohneFalscheNoShows } from '../quellen';
import type { StatusEvent } from '../compute';

const statuses = [
  { id: 'ct', label: 'Closing - Terminiert', type: 'active' },
  { id: 'cns', label: 'Closing - No Show', type: 'active' },
  { id: 'st', label: 'Setting - Terminiert', type: 'active' },
  { id: 'sns', label: 'Setting - No Show', type: 'active' },
  { id: 'won', label: 'Close', type: 'won' },
  { id: 'lost', label: 'Verloren', type: 'lost' },
];
const ev = (o: string, from: string | null, to: string, date: string): StatusEvent => ({ opportunity_id: o, old_status_id: from, new_status_id: to, date, user_id: 'u1' });

describe('ohneFalscheNoShows', () => {
  it('No-Show, 25 Minuten später gewonnen → kein No-Show, Closing gehalten', () => {
    const r = ohneFalscheNoShows([ev('a', 'st', 'ct', '2026-10-19T15:25:00Z'), ev('a', 'ct', 'cns', '2026-10-21T15:05:00Z'), ev('a', 'cns', 'won', '2026-10-21T15:30:00Z')], statuses);
    expect(r.map((e) => [e.old_status_id, e.new_status_id])).toEqual([['st', 'ct'], ['ct', 'won']]);
  });
  it('echter No-Show bleibt: erst am nächsten Tag weiter oder verloren', () => {
    const spaet = [ev('a', 'ct', 'cns', '2026-10-21T15:05:00Z'), ev('a', 'cns', 'won', '2026-10-22T15:30:00Z')];
    expect(ohneFalscheNoShows(spaet, statuses)).toHaveLength(2);
    const verloren = [ev('b', 'ct', 'cns', '2026-10-21T15:05:00Z'), ev('b', 'cns', 'lost', '2026-10-21T15:10:00Z')];
    expect(ohneFalscheNoShows(verloren, statuses)).toHaveLength(2);
    const neuGelegt = [ev('c', 'st', 'sns', '2026-10-21T15:05:00Z'), ev('c', 'sns', 'st', '2026-10-21T15:10:00Z')];
    expect(ohneFalscheNoShows(neuGelegt, statuses)).toHaveLength(2);
  });
});
