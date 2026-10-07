import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';

const findCloseLeadId = vi.fn(async (c: { email?: string | null }) => (c.email === 'miro@solvigo.io' ? 'lead_miro' : null));
const findCloseLeadIdByName = vi.fn(async (n: string) => (n === 'Sinan Kilic' ? 'lead_sinan' : null));
vi.mock('@/lib/sales/close', () => ({ findCloseLeadId: (c: never) => findCloseLeadId(c), findCloseLeadIdByName: (n: string) => findCloseLeadIdByName(n), addCloseNote: vi.fn() }));
vi.mock('@/lib/sales/calendly-chain', () => ({ SALES_AGENCY_ID: 'sales' }));

import { nameAusTitel, fireflieLink } from '../fireflies';
import { signaturOk } from '../signatur';
import { closeNotiz, findeLead, redeanteile, type GespraechAnalyse } from '../analyse';

const t = {
  id: '01M3YF',
  title: 'Miró Neumann: 60min Beratungsgespräch mit Felix Zoepp',
  date: Date.parse('2026-10-07T11:00:00Z'),
  duration: 23,
  transcript_url: null,
  organizer_email: 'felix@zoeppmedia.de',
  meeting_attendees: [{ email: 'felix@zoeppmedia.de', displayName: null, name: null }],
  sentences: [
    { speaker_name: 'Felix-Leon Zoepp', text: 'Erzähl mal, wie viele Vertriebler habt ihr aktuell im Team?', start_time: 12 },
    { speaker_name: 'Miró Neumann', text: 'Drei bis vier.', start_time: 20 },
  ],
  summary: null,
};

describe('Fireflies-Gespräche', () => {
  it('Name aus dem Titel', () => {
    expect(nameAusTitel('Miró Neumann: 60min Beratungsgespräch mit Felix Zoepp')).toBe('Miró Neumann');
    expect(nameAusTitel('Murat Aslan & Sedat Özdemir: 60min Beratungsgespräch')).toBe('Murat Aslan');
    expect(nameAusTitel('Sinan Kilic')).toBe('Sinan Kilic');
    expect(nameAusTitel('Weekly Team Sync mit allen Leuten aus dem Vertrieb')).toBeNull();
  });

  it('Signatur sha256=… wird geprüft', () => {
    const roh = '{"event":"meeting.summarized","meeting_id":"x"}';
    const sig = `sha256=${createHmac('sha256', 'geheim').update(roh).digest('hex')}`;
    expect(signaturOk(roh, sig, 'geheim')).toBe(true);
    expect(signaturOk(roh, sig, 'falsch')).toBe(false);
    expect(signaturOk(roh, null, 'geheim')).toBe(false);
  });

  it('Redeanteile nach Textmenge', () => {
    const r = redeanteile(t);
    expect(r[0].name).toBe('Felix-Leon Zoepp');
    expect(r.reduce((s, x) => s + x.prozent, 0)).toBeGreaterThanOrEqual(99);
  });

  it('Lead über den Calendly-Termin zur selben Zeit', async () => {
    const { client } = createFakeDb({
      calendly_events: [
        { agency_id: 'sales', invitee_name: 'Miró Neumann', invitee_email: 'miro@solvigo.io', invitee_phone: null, start_time: '2026-10-07T11:00:00.000Z' },
        { agency_id: 'sales', invitee_name: 'Jemand Anderes', invitee_email: 'x@y.de', invitee_phone: null, start_time: '2026-10-07T12:00:00.000Z' },
      ],
    });
    expect(await findeLead(client, t)).toMatchObject({ leadId: 'lead_miro' });
  });

  it('ohne Calendly-Termin: über den Namen', async () => {
    const { client } = createFakeDb({ calendly_events: [] });
    expect(await findeLead(client, { ...t, title: 'Sinan Kilic' })).toMatchObject({ leadId: 'lead_sinan', zuordnung: 'Name „Sinan Kilic“' });
  });

  it('Close-Notiz mit Sprungmarken zu den Fehlern', () => {
    const a: GespraechAnalyse = {
      art: 'closing', zusammenfassung: 'Solvigo sucht 5 Vertriebler.', situation: { teamgroesse: '3–4', ziel: '5 neue', budget: '', entscheider: 'Miró', zeitrahmen: 'Q4' },
      einwaende: ['Lieber intern'], naechste_schritte: ['Angebot senden'], abschluss_chance: 55, punkte: 68, staerken: ['Gute Fragen zur Ausgangslage'],
      fehler: [{ fehler: 'Preis vor Budget genannt', zitat: 'Das kostet 2.000 Euro', sekunden: 754, besser: 'Erst Budget und Entscheider klären' }], tipp_naechstes_gespraech: 'Folgetermin mit Entscheidung',
    };
    const n = closeNotiz(t, a);
    expect(n).toContain(`Aufzeichnung: ${fireflieLink('01M3YF')}`);
    expect(n).toContain('GESPRÄCHSFÜHRUNG: 68/100');
    expect(n).toContain('1. Preis vor Budget genannt (bei 12:34 → https://app.fireflies.ai/view/01M3YF?t=754)');
    expect(n).toContain('• Entscheider: Miró');
    expect(n).not.toContain('Budget:');
  });
});

describe('Namen aus dem Titel', () => {
  it('mehrere Personen', async () => {
    const { namenAusTitel } = await import('../fireflies');
    expect(namenAusTitel('Murat Aslan & Sedat Özdemir: 60min Beratungsgespräch')).toEqual(['Murat Aslan', 'Sedat Özdemir']);
    expect(namenAusTitel('Sinan Kilic')).toEqual(['Sinan Kilic']);
  });
});
