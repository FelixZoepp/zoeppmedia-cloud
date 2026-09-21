import { describe, it, expect } from 'vitest';
import { extractIndeedApplication } from '@/lib/workers/ingest-indeed';

const body = {
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
    const r = extractIndeedApplication(body);
    expect(r.firstName).toBe('Max');
    expect(r.lastName).toBe('Mustermann');
    expect(r.phone).toBe('+49 171 1234567');
    expect(r.email).toBe('max@example.com');
    expect(r.jobRef).toBe('aaaaaaaa-0000-0000-0000-000000000001');
    expect(r.consentWhatsapp).toBe(true);
    expect(r.applyId).toBe('apply-123');
  });
  it('consent nein → false', () => {
    const b = structuredClone(body);
    b.questionsAndAnswers[1].answer = 'nein';
    expect(extractIndeedApplication(b).consentWhatsapp).toBe(false);
  });
  it('fullName-Fallback ohne firstName/lastName', () => {
    const b = structuredClone(body) as Record<string, unknown>;
    (b.applicant as Record<string, unknown>).firstName = undefined;
    (b.applicant as Record<string, unknown>).lastName = undefined;
    const r = extractIndeedApplication(b);
    expect(r.firstName).toBe('Max');
    expect(r.lastName).toBe('Mustermann');
  });
  it('answers als Q&A-Liste mit origin indeed', () => {
    const r = extractIndeedApplication(body);
    expect(r.answers).toHaveLength(2);
    expect(r.answers[0]).toMatchObject({ origin: 'indeed' });
  });
  it('resume-Base64 wird erkannt', () => {
    const r = extractIndeedApplication(body);
    expect(r.resume?.mime).toBe('application/pdf');
    expect(r.resume?.data.length).toBeGreaterThan(0);
  });
});
