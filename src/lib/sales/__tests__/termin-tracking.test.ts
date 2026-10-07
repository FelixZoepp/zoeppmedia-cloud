import { describe, it, expect, vi } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';

vi.mock('../close', () => ({ addCloseNoteByEmail: vi.fn(async () => true) }));
vi.mock('../calendly-chain', () => ({ SALES_AGENCY_ID: 'sales' }));
vi.mock('@/lib/activity/log', () => ({
  logActivity: vi.fn(async (svc: { from: (t: string) => { insert: (r: unknown) => Promise<unknown> } }, p: Record<string, unknown>) =>
    svc.from('activity_log').insert({ agency_id: p.agency_id, candidate_id: p.candidate_id, action: p.action, metadata: p.metadata }),
  ),
}));

import { erfasseTerminAktion } from '../termin-tracking';
import { addCloseNoteByEmail } from '../close';

describe('Termin-Aktionen', () => {
  const ev = { agency_id: 'sales', calendly_event_id: 'evt123456', candidate_id: 'c1', invitee_email: 'a@b.de', invitee_phone: '+49170' };

  it('erfasst die Aktion im Verlauf und schreibt eine Close-Notiz', async () => {
    const { client, tables } = createFakeDb({ calendly_events: [ev] });
    expect(await erfasseTerminAktion(client, 'evt123456', 'video', 'Mozilla/5.0 (iPhone)')).toBe(true);
    expect(tables.activity_log).toHaveLength(1);
    expect(String(tables.activity_log[0].action)).toContain('Hat das Video „So läuft das Gespräch ab“ gestartet');
    expect(addCloseNoteByEmail).toHaveBeenCalledWith('a@b.de', expect.stringContaining('Video'), '+49170');
  });

  it('WhatsApp-Linkvorschau zählt nicht', async () => {
    const { client, tables } = createFakeDb({ calendly_events: [ev] });
    expect(await erfasseTerminAktion(client, 'evt123456', 'seite', 'WhatsApp/2.23.20.0')).toBe(false);
    expect(tables.activity_log ?? []).toHaveLength(0);
  });

  it('unbekannter Termin → nichts', async () => {
    const { client } = createFakeDb({ calendly_events: [] });
    expect(await erfasseTerminAktion(client, 'gibtsnicht', 'google', 'Mozilla')).toBe(false);
  });
});
