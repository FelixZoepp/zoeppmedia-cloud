import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';

const notify = vi.fn(async () => undefined);
vi.mock('@/lib/notifications/create', () => ({ createNotification: (...a: unknown[]) => notify(...(a as [])) }));

const { beantworteUmfrage, versendeUmfragen, planeUmfragen, ladeUmfrage } = await import('../versand');

const TOKEN = '11111111-2222-4333-8444-555555555555';
const FRAGEN = [
  { id: 'overall', type: 'rating', label: 'Gesamt' },
  { id: 'nps', type: 'nps', label: 'Empfehlung' },
  { id: 'mehr_bewerber', type: 'choice', label: 'Mehr?', options: ['Ja, locker', 'Nein, passt so'] },
];

function db(schedule: Record<string, unknown> = {}) {
  return createFakeDb({
    agencies: [{ id: 'k1', name: 'Muster GmbH', csm_user_id: 'u-felix' }],
    users: [
      { id: 'u-felix', role: 'admin', funktion: 'csm', aktiv: true, created_at: '2026-01-01' },
      { id: 'u-sales', role: 'employee', funktion: 'closer', aktiv: true, created_at: '2026-01-02' },
    ],
    survey_schedule: [
      {
        id: 's1',
        agency_id: 'k1',
        template_id: 't1',
        token: TOKEN,
        completed_at: null,
        sent_at: null,
        scheduled_at: '2026-10-10T09:00:00Z',
        // Join-Felder, wie PostgREST sie liefert
        survey_templates: { title: 'Kundenzufriedenheit (2-Wochen-Check)', description: null, questions: FRAGEN },
        agencies: { name: 'Muster GmbH' },
        ...schedule,
      },
    ],
    survey_responses: [],
    internal_tasks: [],
  });
}

describe('Antwort über den persönlichen Link', () => {
  beforeEach(() => notify.mockClear());

  it('speichert die Antwort, schließt die Umfrage ab und blockt eine zweite Antwort', async () => {
    const { client, tables } = db();
    expect(await ladeUmfrage(client, TOKEN)).toMatchObject({ status: 'offen', titel: 'Kundenzufriedenheit (2-Wochen-Check)' });

    expect(await beantworteUmfrage(client, TOKEN, { overall: 4, fremd: 1 }, ' passt ')).toEqual({ ok: true });
    expect(tables.survey_responses).toHaveLength(1);
    expect(tables.survey_responses[0]).toMatchObject({ agency_id: 'k1', template_id: 't1', user_id: null, rating: 4, answers: { overall: 4 }, comment: 'passt' });
    expect(tables.survey_schedule[0].completed_at).toBeTruthy();
    expect(tables.survey_schedule[0].response_id).toBe(tables.survey_responses[0].id);

    expect(await beantworteUmfrage(client, TOKEN, { overall: 5 }, null)).toMatchObject({ ok: false, status: 409 });
    expect(tables.survey_responses).toHaveLength(1);
  });

  it('unbekannter oder ungültiger Token → 404, leere Antwort → 400', async () => {
    const { client } = db();
    expect(await beantworteUmfrage(client, 'kein-token', { overall: 4 }, null)).toMatchObject({ ok: false, status: 404 });
    expect(await beantworteUmfrage(client, '99999999-2222-4333-8444-555555555555', { overall: 4 }, null)).toMatchObject({ ok: false, status: 404 });
    expect(await beantworteUmfrage(client, TOKEN, { overall: 9 }, null)).toMatchObject({ ok: false, status: 400 });
  });

  it('kritische Note → Anruf-Aufgabe für den Betreuer mit Benachrichtigung', async () => {
    const { client, tables } = db();
    await beantworteUmfrage(client, TOKEN, { overall: 2 }, null);
    expect(tables.internal_tasks).toHaveLength(1);
    expect(tables.internal_tasks[0]).toMatchObject({ agency_id: 'k1', assigned_to: 'u-felix', priority: 'high', status: 'todo' });
    expect(String(tables.internal_tasks[0].title)).toContain('anrufen');
    expect(notify).toHaveBeenCalledOnce();
  });

  it('NPS 10 + „Ja, locker“ → Empfehlung für den Betreuer, Upsell für den Vertrieb', async () => {
    const { client, tables } = db();
    await beantworteUmfrage(client, TOKEN, { overall: 5, nps: 10, mehr_bewerber: 'Ja, locker' }, null);
    const titel = tables.internal_tasks.map((t) => [t.title, t.assigned_to]);
    expect(titel).toEqual([
      ['Muster GmbH: Empfehlung bzw. Google-Bewertung anfragen', 'u-felix'],
      ['Muster GmbH: Upsell ansprechen', 'u-sales'],
    ]);
  });

  it('gute Antwort ohne Signal → keine Aufgaben', async () => {
    const { client, tables } = db();
    await beantworteUmfrage(client, TOKEN, { overall: 4, nps: 7, mehr_bewerber: 'Nein, passt so' }, null);
    expect(tables.internal_tasks).toHaveLength(0);
  });
});

describe('Versand – kein Nachholen', () => {
  const owner = new Map([['k1', { email: 'chef@muster.de', name: 'Chef' }]]);

  it('verschickt fällige Umfragen ab dem Stichtag mit persönlichem Link und merkt sich den Versand', async () => {
    const { client, tables } = db();
    const senden = vi.fn(async () => ({ data: { id: 'm1' }, error: null }));
    const n = await versendeUmfragen(client, owner, new Date('2026-10-11T08:00:00Z'), senden, null);
    expect(n).toBe(1);
    expect(senden).toHaveBeenCalledWith('chef@muster.de', 'Chef', 'Kundenzufriedenheit (2-Wochen-Check)', expect.stringContaining(`/umfrage/${TOKEN}`));
    expect(tables.survey_schedule[0].sent_at).toBeTruthy();
    expect(await versendeUmfragen(client, owner, new Date('2026-10-12T08:00:00Z'), senden, null)).toBe(0);
  });

  it('alte, nie verschickte Einträge vor dem Stichtag bleiben liegen', async () => {
    const { client, tables } = db({ scheduled_at: '2026-09-14T08:22:00Z' });
    const senden = vi.fn(async () => ({ data: null, error: null }));
    expect(await versendeUmfragen(client, owner, new Date('2026-10-11T08:00:00Z'), senden, null)).toBe(0);
    expect(senden).not.toHaveBeenCalled();
    expect(tables.survey_schedule[0].sent_at).toBeNull();
  });

  it('fehlgeschlagener Versand wird nicht als verschickt markiert', async () => {
    const { client, tables } = db();
    const senden = vi.fn(async () => ({ data: null, error: { message: 'Resend down' } }));
    expect(await versendeUmfragen(client, owner, new Date('2026-10-11T08:00:00Z'), senden, null)).toBe(0);
    expect(tables.survey_schedule[0].sent_at).toBeNull();
  });

  it('Planung: Bestandskunde ohne neuen Zeitpunkt bekommt nichts, neuer Kunde sein Onboarding-Feedback', async () => {
    const { client, tables } = createFakeDb({
      survey_templates: [
        { id: 't-onb', title: 'Onboarding-Feedback', active: true },
        { id: 't-zuf', title: 'Kundenzufriedenheit (2-Wochen-Check)', active: true },
      ],
      activity_log: [
        { agency_id: 'neu', action_type: 'onboarding_complete', created_at: '2026-10-10T09:00:00Z' },
        { agency_id: 'alt', action_type: 'onboarding_complete', created_at: '2026-09-01T09:00:00Z' },
      ],
      survey_schedule: [],
    });
    const n = await planeUmfragen(
      client,
      [
        { id: 'neu', onboarding_completed: true, created_at: '2026-10-09T09:00:00Z' },
        { id: 'alt', onboarding_completed: true, created_at: '2026-08-20T09:00:00Z' },
        { id: 'offen', onboarding_completed: false, created_at: '2026-10-09T09:00:00Z' },
      ],
      new Date('2026-10-10T12:00:00Z'),
    );
    expect(n).toBe(1);
    expect(tables.survey_schedule).toEqual([
      expect.objectContaining({ agency_id: 'neu', trigger_key: 'post_onboarding', template_id: 't-onb', scheduled_at: '2026-10-10T09:00:00.000Z' }),
    ]);
  });
});
