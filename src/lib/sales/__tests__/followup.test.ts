import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'row-1' }),
}));
vi.mock('@/lib/activity/log', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../notify', () => ({ notifySales: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../close', async (orig) => ({
  ...(await orig<typeof import('../close')>()),
  getCloseOpportunity: vi.fn(),
  getCloseLeadContacts: vi.fn(),
  addCloseTask: vi.fn().mockResolvedValue('lead_1'),
  addCloseNoteByEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock('../calendly-chain', async (orig) => ({
  ...(await orig<typeof import('../calendly-chain')>()),
  ensureSalesProspect: vi.fn().mockResolvedValue('p-1'),
}));

import {
  nextFollowupRun,
  isActiveFollowup,
  syncFollowupForOpportunity,
  processSalesFollowup,
  pauseFollowupsOnReply,
} from '../followup';
import { getCloseOpportunity, getCloseLeadContacts, addCloseTask } from '../close';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { notifySales } from '../notify';

const SETTING_FOLLOW_UP = 'stat_EWpujNpwdtq5HSFAMO6c0awZUVgsz6TfO1ZXe5Ff8IT';

type Op = { table: string; op: string; args: unknown[] };

/**
 * Supabase-Mock: data[table] liefert das Ergebnis für maybeSingle/single und für
 * "await query" (Listen). Alle Schreibzugriffe landen in ops.
 */
function makeSvc(data: Record<string, unknown>) {
  const ops: Op[] = [];
  const svc = {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      const result = () => ({ data: data[table] ?? null, error: null });
      for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = vi.fn(() => chain);
      for (const m of ['insert', 'update', 'upsert']) {
        chain[m] = vi.fn((...args: unknown[]) => {
          ops.push({ table, op: m, args });
          return chain;
        });
      }
      chain.maybeSingle = vi.fn(async () => {
        const r = result();
        return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data };
      });
      chain.single = chain.maybeSingle;
      chain.then = (resolve: (v: unknown) => void) => resolve(result());
      return chain;
    }),
  };
  return { svc: svc as never, ops };
}

const opp = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'oppo_1', leadId: 'lead_1', leadName: 'Energietarifmarini', statusId: SETTING_FOLLOW_UP,
  statusLabel: 'Setting - Follow Up', rhythm: '2 Wochen', ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (getCloseLeadContacts as ReturnType<typeof vi.fn>).mockResolvedValue({
    leadName: 'Energietarifmarini', contactName: 'Riccardo Marini', phones: ['+49 177 1908503'], emails: ['r@example.com'],
  });
});

describe('Rhythmus', () => {
  it('rechnet Wochen und Monate und versendet um 10 Uhr deutscher Zeit', () => {
    const now = new Date('2026-10-02T15:00:00Z');
    expect(nextFollowupRun(now, '1 Woche').toISOString()).toBe('2026-10-09T08:00:00.000Z');
    expect(nextFollowupRun(now, '2 Wochen').toISOString()).toBe('2026-10-16T08:00:00.000Z');
    expect(nextFollowupRun(now, '1 Monat').toISOString()).toBe('2026-11-02T08:00:00.000Z');
    expect(nextFollowupRun(now, '3 Monate').toISOString()).toBe('2027-01-02T08:00:00.000Z');
  });

  it('aktiv nur mit Follow-Up-Status UND gewähltem Rhythmus', () => {
    expect(isActiveFollowup({ statusId: SETTING_FOLLOW_UP, rhythm: '1 Monat' })).toBe(true);
    expect(isActiveFollowup({ statusId: SETTING_FOLLOW_UP, rhythm: 'Aus' })).toBe(false);
    expect(isActiveFollowup({ statusId: SETTING_FOLLOW_UP, rhythm: null })).toBe(false);
    expect(isActiveFollowup({ statusId: 'stat_closing_terminiert', rhythm: '1 Monat' })).toBe(false);
  });
});

describe('syncFollowupForOpportunity', () => {
  const now = new Date('2026-10-02T15:00:00Z');

  it('startet die Kette: Prospect aus Close-Nummer, erster Job nach dem Rhythmus', async () => {
    (getCloseOpportunity as ReturnType<typeof vi.fn>).mockResolvedValue(opp());
    const { svc, ops } = makeSvc({
      scheduled_jobs: [],
      candidates: { id: 'p-1', name: 'Riccardo Marini', phone_e164: '+491771908503', whatsapp_opt_in: true, email: null },
      activity_log: [],
    });

    expect(await syncFollowupForOpportunity(svc, 'oppo_1', now)).toBe('started');
    const job = ops.find((o) => o.table === 'scheduled_jobs' && o.op === 'insert')!.args[0] as Record<string, unknown>;
    expect(job).toMatchObject({
      type: 'sales.followup',
      run_at: '2026-10-16T08:00:00.000Z',
      payload: { opportunity_id: 'oppo_1', lead_id: 'lead_1', prospect_id: 'p-1', rhythm: '2 Wochen' },
    });
  });

  it('Rhythmus geändert → wartenden Job umplanen', async () => {
    (getCloseOpportunity as ReturnType<typeof vi.fn>).mockResolvedValue(opp({ rhythm: '3 Monate' }));
    const pending = { id: 'job-1', run_at: 'x', payload: { opportunity_id: 'oppo_1', lead_id: 'lead_1', prospect_id: 'p-1', rhythm: '2 Wochen' } };
    const { svc, ops } = makeSvc({ scheduled_jobs: [pending] });

    expect(await syncFollowupForOpportunity(svc, 'oppo_1', now)).toBe('rescheduled');
    const upd = ops.find((o) => o.op === 'update')!.args[0] as { run_at: string; payload: { rhythm: string } };
    expect(upd.run_at).toBe('2027-01-02T08:00:00.000Z');
    expect(upd.payload.rhythm).toBe('3 Monate');
  });

  it('Status weg von "Follow Up" → wartende Jobs stoppen', async () => {
    (getCloseOpportunity as ReturnType<typeof vi.fn>).mockResolvedValue(opp({ statusId: 'stat_closing', statusLabel: 'Closing - Terminiert' }));
    const { svc, ops } = makeSvc({ scheduled_jobs: [{ id: 'job-1', run_at: 'x', payload: {} }] });

    expect(await syncFollowupForOpportunity(svc, 'oppo_1', now)).toBe('stopped');
    expect(ops.find((o) => o.op === 'update')!.args[0]).toMatchObject({ status: 'cancelled' });
  });

  it('ohne Handynummer in Close → Hinweis, keine Kette', async () => {
    (getCloseOpportunity as ReturnType<typeof vi.fn>).mockResolvedValue(opp());
    (getCloseLeadContacts as ReturnType<typeof vi.fn>).mockResolvedValue({ leadName: 'X', contactName: null, phones: [], emails: [] });
    const { svc, ops } = makeSvc({ scheduled_jobs: [] });

    expect(await syncFollowupForOpportunity(svc, 'oppo_1', now)).toBe('no_whatsapp');
    expect(ops.some((o) => o.table === 'scheduled_jobs')).toBe(false);
  });
});

describe('processSalesFollowup', () => {
  const now = new Date('2026-10-16T08:00:00Z');
  const payload = { opportunity_id: 'oppo_1', lead_id: 'lead_1', prospect_id: 'p-1', rhythm: '2 Wochen' };
  const prospect = { id: 'p-1', name: 'Riccardo Marini', phone_e164: '+491771908503', whatsapp_opt_in: true, email: null };

  it('sendet die nächste freigegebene Vorlage (überspringt nicht freigegebene) und plant den Folgeschritt', async () => {
    (getCloseOpportunity as ReturnType<typeof vi.fn>).mockResolvedValue(opp());
    const { svc, ops } = makeSvc({
      candidates: prospect,
      activity_log: [],
      // fu_1..fu_3 noch nicht freigegeben → zuerst fu_4_frage
      whatsapp_templates: [
        { id: 't4', name: 'fu_4_frage', preset_key: 'fu_4_frage' },
        { id: 't6', name: 'fu_6_abschied', preset_key: 'fu_6_abschied' },
      ],
      conversations: { id: 'conv-1' },
    });

    expect(await processSalesFollowup(svc, payload, now)).toBe('sent');
    const send = (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(send.payload.template.name).toBe('fu_4_frage');
    expect(send.payload.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(['Riccardo', 'Energietarifmarini']);
    const next = ops.find((o) => o.table === 'scheduled_jobs' && o.op === 'insert')!.args[0] as { run_at: string };
    expect(next.run_at).toBe('2026-10-30T08:00:00.000Z');
  });

  it('Opportunity nicht mehr im Follow-up → nichts senden', async () => {
    (getCloseOpportunity as ReturnType<typeof vi.fn>).mockResolvedValue(opp({ rhythm: 'Aus' }));
    const { svc } = makeSvc({});
    expect(await processSalesFollowup(svc, payload, now)).toBe('inactive');
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('alle Vorlagen gesendet → Kette beendet', async () => {
    (getCloseOpportunity as ReturnType<typeof vi.fn>).mockResolvedValue(opp());
    const { svc } = makeSvc({
      candidates: prospect,
      activity_log: [{ metadata: { step: 5 } }],
      whatsapp_templates: [{ id: 't6', name: 'fu_6_abschied', preset_key: 'fu_6_abschied' }],
    });
    expect(await processSalesFollowup(svc, payload, now)).toBe('completed');
    expect(notifySales).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ emoji: '🏁' }));
  });
});

describe('pauseFollowupsOnReply', () => {
  it('Antwort während laufender Kette → stoppen, Aufgabe in Close, Slack', async () => {
    const { svc, ops } = makeSvc({ scheduled_jobs: [{ id: 'job-1', run_at: 'x', payload: {} }] });
    const paused = await pauseFollowupsOnReply(
      svc, { id: 'p-1', name: 'Riccardo Marini', phone: '+491771908503' }, 'Ja, weiterhin', 'conv-1', '2026-10-16',
    );
    expect(paused).toBe(true);
    expect(ops.find((o) => o.op === 'update')!.args[0]).toMatchObject({ status: 'cancelled' });
    expect(addCloseTask).toHaveBeenCalledWith(
      { email: undefined, phone: '+491771908503' }, expect.stringContaining('Auf WhatsApp-Antwort reagieren'), '2026-10-16',
    );
    expect(notifySales).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Antwort auf Follow-up: Riccardo Marini' }));
  });

  it('keine laufende Kette → nichts tun', async () => {
    const { svc } = makeSvc({ scheduled_jobs: [] });
    expect(await pauseFollowupsOnReply(svc, { id: 'p-1', name: 'X', phone: '+49' }, 'Hallo', 'c', '2026-10-16')).toBe(false);
    expect(addCloseTask).not.toHaveBeenCalled();
  });
});
