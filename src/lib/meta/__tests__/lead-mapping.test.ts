import { describe, it, expect } from 'vitest';
import { resolveMetaJob } from '@/lib/meta/lead-mapping';

const src = (config: Record<string, unknown>) => ({ config });

describe('resolveMetaJob', () => {
  it('mappt form_id auf job_id', () => {
    const r = resolveMetaJob([src({ forms: { f1: 'job-a' }, page_token: 'tok' })], 'f1');
    expect(r.jobId).toBe('job-a');
    expect(r.pageToken).toBe('tok');
  });
  it('fällt auf default_job_id zurück', () => {
    const r = resolveMetaJob([src({ forms: { f1: 'job-a' }, default_job_id: 'job-x' })], 'f2');
    expect(r.jobId).toBe('job-x');
  });
  it('ohne Quelle: null', () => {
    expect(resolveMetaJob([], 'f1')).toEqual({ jobId: null, pageToken: null });
  });
  it('bevorzugt Quelle mit passendem Formular vor Quelle mit nur default', () => {
    const r = resolveMetaJob(
      [src({ default_job_id: 'job-x' }), src({ forms: { f1: 'job-a' } })],
      'f1'
    );
    expect(r.jobId).toBe('job-a');
  });
});
