import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractIndeedApplication, processIngestIndeed } from '@/lib/workers/ingest-indeed';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/recruiting/ingest', () => ({
  ingestApplication: vi.fn().mockResolvedValue({ candidateId: 'cand-1', phoneInvalid: false }),
}));

vi.mock('@/lib/activity/log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/email/resend', () => ({
  sendOptInFallbackEmail: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Chain-Mock helper (pattern from appointment-reminders.test.ts)
// ---------------------------------------------------------------------------

function makeSvc(tableResponses: Record<string, unknown> = {}) {
  const fromMock = vi.fn();
  const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {};

  function enqueue(table: string, resp: { data: unknown; error: unknown }) {
    if (!queues[table]) queues[table] = [];
    queues[table].push(resp);
  }

  function dequeue(table: string): { data: unknown; error: unknown } {
    if (queues[table] && queues[table].length > 0) return queues[table].shift()!;
    if (table in tableResponses) return tableResponses[table] as { data: unknown; error: unknown };
    return { data: null, error: null };
  }

  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = [
      'select', 'eq', 'is', 'in', 'filter', 'not', 'maybeSingle', 'single',
      'insert', 'update', 'upsert', 'delete', 'gte', 'lte', 'or', 'limit',
    ];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }
    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(dequeue(table))
    );
    (chain.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(dequeue(table))
    );
    return chain;
  });

  const storageMock = {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ error: null }),
    })),
  };

  return {
    svc: { from: fromMock, storage: storageMock } as unknown as import('@supabase/supabase-js').SupabaseClient,
    fromMock,
    storageMock,
    enqueue,
  };
}

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const baseBody = {
  id: 'apply-xyz',
  job: { jobId: 'ext-ref-abc' },
  applicant: {
    firstName: 'Max',
    lastName: 'Mustermann',
    email: 'max@example.com',
    phoneNumber: '+49 171 1234567',
    resume: { file: { contentType: 'application/pdf', fileName: 'cv.pdf', data: 'JVBERi0=' } },
  },
  questionsAndAnswers: [
    { question: { id: 'consent_whatsapp', question: 'WhatsApp OK?' }, answer: 'ja' },
  ],
};

const jobRow = { id: 'job-1', agency_id: 'ag-1', slug: 'job-slug' };
const agencyRow = { id: 'ag-1', slug: 'ag-slug' };

// ---------------------------------------------------------------------------
// extractIndeedApplication — edge-case tests
// ---------------------------------------------------------------------------

const fullBody = {
  id: 'apply-123',
  job: { jobId: 'aaaaaaaa-0000-0000-0000-000000000001' },
  applicant: {
    fullName: 'Max Mustermann',
    firstName: 'Max',
    lastName: 'Mustermann',
    email: 'max@example.com',
    phoneNumber: '+49 171 1234567',
    resume: { file: { contentType: 'application/pdf', fileName: 'cv.pdf', data: 'JVBERi0=' } },
  },
  questionsAndAnswers: [
    { question: { id: 'phone', question: 'Wie lautet deine Telefonnummer?' }, answer: '+49 171 1234567' },
    { question: { id: 'consent_whatsapp', question: 'Dürfen wir dich per WhatsApp kontaktieren?' }, answer: 'ja' },
  ],
};

describe('extractIndeedApplication', () => {
  it('extrahiert Name, Telefon, E-Mail, Job und Consent', () => {
    const r = extractIndeedApplication(fullBody);
    expect(r.firstName).toBe('Max');
    expect(r.lastName).toBe('Mustermann');
    expect(r.phone).toBe('+49 171 1234567');
    expect(r.email).toBe('max@example.com');
    expect(r.jobRef).toBe('aaaaaaaa-0000-0000-0000-000000000001');
    expect(r.consentWhatsapp).toBe(true);
    expect(r.applyId).toBe('apply-123');
  });
  it('consent nein → false', () => {
    const b = structuredClone(fullBody);
    b.questionsAndAnswers[1].answer = 'nein';
    expect(extractIndeedApplication(b).consentWhatsapp).toBe(false);
  });
  it('fullName-Fallback ohne firstName/lastName', () => {
    const b = structuredClone(fullBody) as Record<string, unknown>;
    (b.applicant as Record<string, unknown>).firstName = undefined;
    (b.applicant as Record<string, unknown>).lastName = undefined;
    const r = extractIndeedApplication(b);
    expect(r.firstName).toBe('Max');
    expect(r.lastName).toBe('Mustermann');
  });
  it('answers als Q&A-Liste mit origin indeed', () => {
    const r = extractIndeedApplication(fullBody);
    expect(r.answers).toHaveLength(2);
    expect(r.answers[0]).toMatchObject({ origin: 'indeed' });
  });
  it('resume-Base64 wird erkannt', () => {
    const r = extractIndeedApplication(fullBody);
    expect(r.resume?.mime).toBe('application/pdf');
    expect(r.resume?.data.length).toBeGreaterThan(0);
  });
});

describe('extractIndeedApplication — edge cases', () => {
  it('fullName ohne Leerzeichen ("Cher") → lastName leer', () => {
    const body = {
      id: 'x',
      job: { jobId: 'ref-1' },
      applicant: { fullName: 'Cher' },
      questionsAndAnswers: [],
    };
    const r = extractIndeedApplication(body);
    expect(r.firstName).toBe('Cher');
    expect(r.lastName).toBe('');
  });

  it('fehlendes resume → resume null', () => {
    const body = {
      id: 'x',
      job: { jobId: 'ref-1' },
      applicant: { firstName: 'Anna', lastName: 'Müller' },
      questionsAndAnswers: [],
    };
    const r = extractIndeedApplication(body);
    expect(r.resume).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// processIngestIndeed
// ---------------------------------------------------------------------------

describe('processIngestIndeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Happy Path: Consent ja + Resume → Storage-Upload + ingestApplication(source=indeed, consentWhatsapp=true)', async () => {
    const { svc, enqueue, storageMock } = makeSvc();

    enqueue('jobs', { data: jobRow, error: null });

    const { ingestApplication } = await import('@/lib/recruiting/ingest');

    await processIngestIndeed(svc, 'ag-1', { body: baseBody });

    // Storage upload aufgerufen
    expect(storageMock.from).toHaveBeenCalledWith('recruiting-documents');
    const uploadFn = storageMock.from.mock.results[0].value.upload;
    expect(uploadFn).toHaveBeenCalledOnce();
    const [storagePath] = uploadFn.mock.calls[0];
    expect(storagePath).toMatch(/indeed-apply-xyz/);

    // ingestApplication mit korrekten Feldern
    expect(ingestApplication).toHaveBeenCalledOnce();
    const callArg = (ingestApplication as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArg.source).toBe('indeed');
    expect(callArg.sourceRef).toBe('apply-xyz');
    expect(callArg.consentWhatsapp).toBe(true);
    expect(callArg.agencyId).toBe('ag-1');
  });

  it('Kein Consent: ingestApplication(consentWhatsapp=false) + logActivity + sendOptInFallbackEmail', async () => {
    const { svc, enqueue } = makeSvc();

    const noConsentBody = structuredClone(baseBody);
    noConsentBody.questionsAndAnswers[0].answer = 'nein';

    enqueue('jobs', { data: jobRow, error: null });
    // agencies lookup für Fallback-Mail
    enqueue('agencies', { data: agencyRow, error: null });

    const { ingestApplication } = await import('@/lib/recruiting/ingest');
    const { logActivity } = await import('@/lib/activity/log');
    const { sendOptInFallbackEmail } = await import('@/lib/email/resend');

    await processIngestIndeed(svc, 'ag-1', { body: noConsentBody });

    const callArg = (ingestApplication as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArg.consentWhatsapp).toBe(false);

    expect(logActivity).toHaveBeenCalled();
    expect(sendOptInFallbackEmail).toHaveBeenCalledOnce();
    const [emailTo, emailFirstName, emailUrl] = (sendOptInFallbackEmail as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(emailTo).toBe('max@example.com');
    expect(emailFirstName).toBe('Max');
    expect(emailUrl).toContain('/apply/ag-slug/job-slug');
  });

  it('Agency-Mismatch: Event-agencyId ≠ job.agency_id → wirft', async () => {
    const { svc, enqueue } = makeSvc();

    // Job gehört zu 'ag-2', aber Event sagt 'ag-1'
    enqueue('jobs', { data: { id: 'job-1', agency_id: 'ag-2', slug: 'job-slug' }, error: null });

    await expect(
      processIngestIndeed(svc, 'ag-1', { body: baseBody })
    ).rejects.toThrow('agency_id-Mismatch');
  });
});
