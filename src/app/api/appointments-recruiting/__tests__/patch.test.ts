import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks ---
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
  getEffectiveAgencyId: vi.fn(),
}));

vi.mock('@/lib/recruiting/scope', () => ({
  canWriteRole: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/appointments/lifecycle', () => ({
  cancelAppointment: vi.fn(),
  createProposedAppointment: vi.fn(),
}));

vi.mock('@/lib/automations/fire', () => ({
  fireEvent: vi.fn(),
}));

vi.mock('@/lib/activity/log', () => ({
  logActivity: vi.fn(),
}));

import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { cancelAppointment, createProposedAppointment } from '@/lib/appointments/lifecycle';
import { fireEvent } from '@/lib/automations/fire';
import { logActivity } from '@/lib/activity/log';
import { PATCH } from '../[id]/route';

// --- Konstanten ---
const AGENCY_ID  = '00000000-0000-4000-8000-000000000001';
const APPT_ID    = '00000000-0000-4000-8000-000000000002';
const APP_ID     = '00000000-0000-4000-8000-000000000003';
const CAND_ID    = '00000000-0000-4000-8000-000000000004';
const USER_ID    = '00000000-0000-4000-8000-000000000005';
const NEW_APPT_ID = '00000000-0000-4000-8000-000000000006';

// --- Hilfsfunktionen ---
function makeParams(id = APPT_ID): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/appointments-recruiting/${APPT_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeMalformedRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/appointments-recruiting/${APPT_ID}`, {
    method: 'PATCH',
    body: 'dies ist { kein json',
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Erstellt einen chainbaren Supabase-Query-Mock. */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'update', 'insert', 'delete', 'order', 'upsert', 'filter', 'in']) {
    chain[m] = self;
  }
  chain['maybeSingle'] = () => Promise.resolve(result);
  chain['single']      = () => Promise.resolve(result);
  chain['then']        = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

const MOCK_APPT = {
  id: APPT_ID,
  agency_id: AGENCY_ID,
  application_id: APP_ID,
  type: 'video',
  location: 'https://meet.example.com',
  booking_token: 'tok-abc',
};

const MOCK_APP = { candidate_id: CAND_ID };

// --- Tests ---

describe('PATCH /api/appointments-recruiting/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID, email: 'test@test.de', name: 'Test', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
    vi.mocked(canWriteRole).mockReturnValue(true);
    vi.mocked(logActivity).mockResolvedValue(undefined);
    vi.mocked(fireEvent).mockResolvedValue(undefined);
  });

  it('401 ohne Auth', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await PATCH(makePatchRequest({ status: 'done' }), { params: makeParams() });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/autorisiert/i);
  });

  it('403 ohne Schreibrechte', async () => {
    vi.mocked(canWriteRole).mockReturnValue(false);

    const res = await PATCH(makePatchRequest({ status: 'done' }), { params: makeParams() });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Schreibrechte/i);
  });

  it('403 ohne Agentur', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);

    const res = await PATCH(makePatchRequest({ status: 'done' }), { params: makeParams() });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Agentur/i);
  });

  it('400 bei ungültigem JSON', async () => {
    const res = await PATCH(makeMalformedRequest(), { params: makeParams() });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Request-Body/i);
  });

  it('400 bei ungültigem Status', async () => {
    const res = await PATCH(makePatchRequest({ status: 'booked' }), { params: makeParams() });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Status/i);
  });

  it('404 bei fremder Agentur', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (_table: string) => makeChain({ data: null, error: null }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PATCH(makePatchRequest({ status: 'done' }), { params: makeParams() });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/nicht gefunden/i);
  });

  it('setzt status done und loggt Activity', async () => {
    let updateCalledWith: unknown = null;

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'appointments') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: MOCK_APPT, error: null }) }) }) }),
            update: (data: unknown) => {
              updateCalledWith = data;
              return { eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
            },
          };
        }
        if (table === 'applications') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: MOCK_APP, error: null }) }) }) }),
          };
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PATCH(makePatchRequest({ status: 'done' }), { params: makeParams() });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(updateCalledWith).toMatchObject({ status: 'done' });
    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action_type: 'appointment_done' }),
    );
  });

  it('setzt status no_show, plant no_show_followup und feuert appointment.no_show', async () => {
    let upsertPayload: unknown = null;

    vi.mocked(createProposedAppointment).mockResolvedValue({
      appointmentId: NEW_APPT_ID,
      bookingToken: 'new-token',
    });

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'appointments') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: MOCK_APPT, error: null }) }) }) }),
            update: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }),
          };
        }
        if (table === 'applications') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: MOCK_APP, error: null }) }) }) }),
          };
        }
        if (table === 'scheduled_jobs') {
          return {
            upsert: (payload: unknown) => {
              upsertPayload = payload;
              return Promise.resolve({ data: null, error: null });
            },
          };
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PATCH(makePatchRequest({ status: 'no_show' }), { params: makeParams() });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(upsertPayload).toMatchObject({
      type: 'appointment.no_show_followup',
      agency_id: AGENCY_ID,
    });

    expect(fireEvent).toHaveBeenCalledWith(
      'appointment.no_show',
      AGENCY_ID,
      expect.objectContaining({ candidate_id: CAND_ID }),
    );

    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action_type: 'appointment_no_show' }),
    );
  });

  it('setzt status cancelled und ruft cancelAppointment', async () => {
    vi.mocked(cancelAppointment).mockResolvedValue(undefined);

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'appointments') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: MOCK_APPT, error: null }) }) }) }),
          };
        }
        if (table === 'applications') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: MOCK_APP, error: null }) }) }) }),
          };
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PATCH(makePatchRequest({ status: 'cancelled' }), { params: makeParams() });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(cancelAppointment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ agencyId: AGENCY_ID, appointmentId: APPT_ID }),
    );
  });
});
