import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

import { baueEinstellungNachricht, vorname } from '../einstellung-feier';

describe('einstellung-feier', () => {
  it('nur Vorname, nie der volle Name', () => {
    expect(vorname('  Max Mustermann ')).toBe('Max');
    expect(vorname(null)).toBeNull();
    expect(vorname('')).toBeNull();
  });
  it('Slack-Nachricht nennt Kunde, Vorname, Stelle und Zähler', () => {
    const n = baueEinstellungNachricht({ kunde: 'Hoffmann Solutions', vorname: 'Max', stelle: 'Vertriebler', nrKunde: 3, nrMonat: 7, monat: 'November' });
    const s = JSON.stringify(n.blocks);
    expect(n.text).toContain('Hoffmann Solutions');
    expect(s).toContain('*Max*');
    expect(s).toContain('Vertriebler');
    expect(s).toContain('Nr. *3*');
    expect(s).toContain('Nr. *7*');
    expect(s).not.toContain('Mustermann');
  });
});
