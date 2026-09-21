import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock-Supabase-Svc: verkettbare Query-API simulieren
type MockFn = ReturnType<typeof vi.fn>;

interface MockQuery {
  select: MockFn;
  eq: MockFn;
  in: MockFn;
  not: MockFn;
  maybeSingle: MockFn;
  single: MockFn;
}

function makeQuery(result: { data: unknown; error?: unknown }): MockQuery {
  const q: MockQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    not: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
  };
  // Jede Methode gibt das Query-Objekt zurück (Chaining)
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.in.mockReturnValue(q);
  q.not.mockReturnValue(q);
  return q;
}

const mockSvc = {
  from: vi.fn(),
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockSvc),
}));

vi.mock('@/lib/appointments/slots', () => ({
  computeSlots: vi.fn().mockReturnValue([
    { start: new Date('2026-10-10T08:00:00Z'), end: new Date('2026-10-10T08:30:00Z') },
  ]),
}));

vi.mock('@/lib/appointments/lifecycle', () => ({
  bookAppointment: vi.fn().mockResolvedValue(undefined),
  cancelAppointment: vi.fn().mockResolvedValue(undefined),
  rescheduleAppointment: vi.fn().mockResolvedValue({ newAppointmentId: 'appt-new' }),
}));

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function futureDate(): string {
  return new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
}

function pastDate(): string {
  return new Date(Date.now() - 1000).toISOString();
}

function makeAppt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'appt-1',
    agency_id: 'agency-1',
    application_id: 'app-1',
    status: 'proposed',
    token_expires_at: futureDate(),
    type: 'video_call',
    location: null,
    ...overrides,
  };
}

// Helfer: from() so konfigurieren, dass verschiedene Tabellen verschiedene
// Ergebnisse liefern.
function setupMockSvc(config: {
  appt?: { data: unknown; error?: unknown } | null;
  application?: { data: unknown; error?: unknown } | null;
  job?: { data: unknown; error?: unknown } | null;
  rules?: { data: unknown; error?: unknown } | null;
  agency?: { data: unknown; error?: unknown } | null;
  booked?: { data: unknown; error?: unknown } | null;
}) {
  mockSvc.from.mockImplementation((table: string) => {
    switch (table) {
      case 'appointments': {
        const apptResult = config.appt ?? { data: makeAppt(), error: null };
        const bookedResult = config.booked ?? { data: [], error: null };
        // appointments wird zweimal aufgerufen: einmal für Token-Lookup (maybeSingle),
        // einmal für gebuchte Slots (nicht single). Wir geben immer einen Query zurück,
        // der beide Modi bedient.
        const q = makeQuery(apptResult);
        // single() für Token-Lookup
        q.maybeSingle.mockResolvedValue(apptResult);
        // Für .in().not() Kette (gebuchte Termine)
        q.in.mockReturnValue({
          ...q,
          not: vi.fn().mockResolvedValue(bookedResult),
        });
        return q;
      }
      case 'applications': {
        const r = config.application ?? { data: { job_id: 'job-1' }, error: null };
        return makeQuery(r);
      }
      case 'jobs': {
        const r = config.job ?? {
          data: { id: 'job-1', appointment_duration_minutes: 30, appointment_buffer_minutes: 15 },
          error: null,
        };
        return makeQuery(r);
      }
      case 'availability_rules': {
        const r = config.rules ?? {
          data: [{ weekday: 1, start_time: '08:00:00', end_time: '17:00:00' }],
          error: null,
        };
        return makeQuery(r);
      }
      case 'agencies': {
        const r = config.agency ?? { data: { timezone: 'Europe/Berlin' }, error: null };
        return makeQuery(r);
      }
      default:
        return makeQuery({ data: null, error: null });
    }
  });
}

// ─── Requests simulieren ─────────────────────────────────────────────────────

function makeGetRequest(token: string): Request {
  return new Request(`http://localhost/api/book/${token}/slots`);
}

function makePostRequest(token: string, body: unknown): Request {
  return new Request(`http://localhost/api/book/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/book/[token]/slots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('liefert Slots für gültigen Token', async () => {
    setupMockSvc({});
    const { GET } = await import('@/app/api/book/[token]/slots/route');
    const req = makeGetRequest('valid-token');
    const res = await GET(req, { params: Promise.resolve({ token: 'valid-token' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.slots)).toBe(true);
    expect(json.slots.length).toBeGreaterThan(0);
    expect(json.slots[0]).toHaveProperty('start');
    expect(json.slots[0]).toHaveProperty('end');
  });

  it('410 bei abgelaufenem Token', async () => {
    setupMockSvc({ appt: { data: makeAppt({ token_expires_at: pastDate() }), error: null } });
    // Modul neu laden wegen vi.clearAllMocks
    const { GET } = await import('@/app/api/book/[token]/slots/route');
    const req = makeGetRequest('expired-token');
    const res = await GET(req, { params: Promise.resolve({ token: 'expired-token' }) });
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.error).toBe('Buchungslink abgelaufen');
  });

  it('404 bei unbekanntem Token', async () => {
    setupMockSvc({ appt: { data: null, error: null } });
    const { GET } = await import('@/app/api/book/[token]/slots/route');
    const req = makeGetRequest('unknown-token');
    const res = await GET(req, { params: Promise.resolve({ token: 'unknown-token' }) });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Termin nicht gefunden');
  });
});

describe('POST /api/book/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bucht Slot und liefert 200', async () => {
    setupMockSvc({});
    const { bookAppointment } = await import('@/lib/appointments/lifecycle');
    const { POST } = await import('@/app/api/book/[token]/route');
    const req = makePostRequest('valid-token', { action: 'book', start: '2026-10-10T08:00:00Z' });
    const res = await POST(req, { params: Promise.resolve({ token: 'valid-token' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(bookAppointment).toHaveBeenCalledOnce();
  });

  it('409 bei Slot-Konflikt (P4-R5)', async () => {
    setupMockSvc({});
    const { bookAppointment } = await import('@/lib/appointments/lifecycle');
    vi.mocked(bookAppointment).mockRejectedValueOnce(new Error('Slot bereits vergeben'));
    const { POST } = await import('@/app/api/book/[token]/route');
    const req = makePostRequest('valid-token', { action: 'book', start: '2026-10-10T08:00:00Z' });
    const res = await POST(req, { params: Promise.resolve({ token: 'valid-token' }) });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Slot bereits vergeben');
  });

  it('400 bei ungültigem Body', async () => {
    setupMockSvc({});
    const { POST } = await import('@/app/api/book/[token]/route');
    const req = new Request('http://localhost/api/book/valid-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'kein-json{{{',
    });
    const res = await POST(req, { params: Promise.resolve({ token: 'valid-token' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Ungültiger Request-Body');
  });

  it('verschiebt Termin mit action reschedule', async () => {
    setupMockSvc({});
    const { rescheduleAppointment } = await import('@/lib/appointments/lifecycle');
    const { POST } = await import('@/app/api/book/[token]/route');
    const req = makePostRequest('valid-token', { action: 'reschedule', start: '2026-10-11T09:00:00Z' });
    const res = await POST(req, { params: Promise.resolve({ token: 'valid-token' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(rescheduleAppointment).toHaveBeenCalledOnce();
  });

  it('sagt Termin ab mit action cancel', async () => {
    setupMockSvc({});
    const { cancelAppointment } = await import('@/lib/appointments/lifecycle');
    const { POST } = await import('@/app/api/book/[token]/route');
    const req = makePostRequest('valid-token', { action: 'cancel' });
    const res = await POST(req, { params: Promise.resolve({ token: 'valid-token' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(cancelAppointment).toHaveBeenCalledOnce();
  });

  it('400 bei unbekannter Aktion', async () => {
    setupMockSvc({});
    const { POST } = await import('@/app/api/book/[token]/route');
    const req = makePostRequest('valid-token', { action: 'destroy' });
    const res = await POST(req, { params: Promise.resolve({ token: 'valid-token' }) });
    expect(res.status).toBe(400);
  });

  it('410 bei abgelaufenem Token (POST)', async () => {
    setupMockSvc({ appt: { data: makeAppt({ token_expires_at: pastDate() }), error: null } });
    const { POST } = await import('@/app/api/book/[token]/route');
    const req = makePostRequest('expired-token', { action: 'cancel' });
    const res = await POST(req, { params: Promise.resolve({ token: 'expired-token' }) });
    expect(res.status).toBe(410);
  });

  it('404 bei unbekanntem Token (POST)', async () => {
    setupMockSvc({ appt: { data: null, error: null } });
    const { POST } = await import('@/app/api/book/[token]/route');
    const req = makePostRequest('unknown-token', { action: 'cancel' });
    const res = await POST(req, { params: Promise.resolve({ token: 'unknown-token' }) });
    expect(res.status).toBe(404);
  });
});
