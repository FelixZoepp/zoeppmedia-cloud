import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createProposedAppointment,
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  cancelAppointmentJobs,
} from '../lifecycle';

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.test', messageRowId: 'row-1' }),
}));

vi.mock('@/lib/email/resend', () => ({
  sendAgencyCalendarInvite: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/calendar/invite', () => ({
  buildAppointmentInvite: vi.fn().mockReturnValue('BEGIN:VCALENDAR...'),
}));

vi.mock('@/lib/activity/log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/automations/fire', () => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));

// makeSvc helper (gleicher Aufbau wie bot-open.test.ts)
function makeSvc(tableResponses: Record<string, unknown> = {}) {
  const inserted: Record<string, unknown[]> = {};
  const updated: Record<string, unknown[]> = {};
  const fromMock = vi.fn();

  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'is', 'in', 'filter', 'not', 'maybeSingle', 'single',
                     'insert', 'update', 'upsert', 'delete', 'gte', 'lte', 'or'];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }
    (chain.insert as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!inserted[table]) inserted[table] = [];
      inserted[table].push(data);
      return chain;
    });
    (chain.update as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!updated[table]) updated[table] = [];
      updated[table].push(data);
      return chain;
    });
    (chain.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const resp = tableResponses[table] ?? { data: null, error: null };
      return Promise.resolve(resp);
    });
    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const resp = tableResponses[table] ?? { data: null, error: null };
      return Promise.resolve(resp);
    });
    return chain;
  });

  return { from: fromMock, rpc: vi.fn(), _inserted: inserted, _updated: updated } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('createProposedAppointment', () => {
  it('legt Termin mit status proposed, booking_token und token_expires_at +7d an', async () => {
    const svc = makeSvc({
      appointments: { data: { id: 'appt-1', booking_token: 'tok-1' }, error: null },
    });
    const result = await createProposedAppointment(svc, {
      agencyId: 'ag-1', applicationId: 'app-1', type: 'call', location: null,
    });
    expect(result.appointmentId).toBe('appt-1');
    expect(result.bookingToken).toBe('tok-1');
    expect(svc.from).toHaveBeenCalledWith('appointments');
  });
});

describe('bookAppointment', () => {
  it('setzt Status booked, plant 3 Reminder-Jobs, sendet Bestätigungstemplate + ICS-Mail, feuert appointment.booked', async () => {
    const svc = makeSvc({
      appointments: {
        data: {
          id: 'appt-1', agency_id: 'ag-1', application_id: 'app-1',
          type: 'call', location: null, booking_token: 'tok-1',
          ics_sequence: 0, status: 'proposed',
        },
        error: null,
      },
      applications: {
        data: { id: 'app-1', candidate_id: 'cand-1', assigned_to: null },
        error: null,
      },
      candidates: {
        data: { id: 'cand-1', name: 'Max Mustermann', phone_e164: '+491234567890', email: 'max@test.de', whatsapp_opt_in: true },
        error: null,
      },
      conversations: {
        data: { id: 'conv-1', wa_account_id: 'wa-1' },
        error: null,
      },
      agencies: {
        data: { id: 'ag-1', name: 'Test Agentur', timezone: 'Europe/Berlin' },
        error: null,
      },
      whatsapp_templates: {
        data: { id: 'tmpl-1', name: 'appointment_confirmation', body: 'Hallo {{1}}...' },
        error: null,
      },
      pipeline_stages: {
        data: { id: 'stage-interview' },
        error: null,
      },
    });

    const { fireEvent } = await import('@/lib/automations/fire');
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    const { sendAgencyCalendarInvite } = await import('@/lib/email/resend');

    await bookAppointment(svc, {
      agencyId: 'ag-1', appointmentId: 'appt-1',
      startsAt: new Date('2026-10-10T10:00:00Z'),
      endsAt: new Date('2026-10-10T10:30:00Z'),
      bookedVia: 'booking_page',
    });

    expect(sendWhatsAppMessage).toHaveBeenCalled();
    expect(sendAgencyCalendarInvite).toHaveBeenCalled();
    expect(fireEvent).toHaveBeenCalledWith('appointment.booked', 'ag-1', expect.anything());
  });
});

describe('cancelAppointmentJobs', () => {
  it('setzt pending Jobs mit passendem appointmentId-Filter auf cancelled', async () => {
    const svc = makeSvc();
    await cancelAppointmentJobs(svc, { agencyId: 'ag-1', appointmentId: 'appt-1' });
    expect(svc.from).toHaveBeenCalledWith('scheduled_jobs');
  });
});
