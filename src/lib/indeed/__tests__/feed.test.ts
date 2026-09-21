import { describe, it, expect } from 'vitest';
import { buildIndeedFeed, cdata } from '@/lib/indeed/feed';

const base = {
  agencyName: 'Test GmbH & Co',
  agencySlug: 'test-gmbh',
  baseUrl: 'https://cloud.zoeppmedia.de',
};
const job = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  title: 'Vertriebsmitarbeiter (m/w/d)',
  slug: 'vertrieb',
  city: 'Köln',
  description: 'Tolles Team',
  indeed_mode: 'apply' as const,
  created_at: '2026-09-21T10:00:00Z',
  external_ref: null,
};

describe('buildIndeedFeed', () => {
  it('erzeugt gültiges XML mit source und job', () => {
    const xml = buildIndeedFeed({ ...base, jobs: [job] });
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain('<source>');
    expect(xml).toContain('<![CDATA[Test GmbH & Co]]>');
    expect(xml).toContain('<job>');
  });

  it('apply-Modus: indeed-apply-data mit postUrl und questions-URL', () => {
    const xml = buildIndeedFeed({ ...base, jobs: [job] });
    expect(xml).toContain('indeed-apply-data');
    expect(xml).toContain(encodeURIComponent('https://cloud.zoeppmedia.de/api/webhooks/indeed/apply'));
    expect(xml).toContain(encodeURIComponent(`https://cloud.zoeppmedia.de/api/indeed/questions/${job.id}.json`));
    expect(xml).toContain(`indeed-apply-jobId=${encodeURIComponent(job.id)}`);
  });

  it('redirect-Modus: keine indeed-apply-data, URL zeigt auf /apply mit src=indeed', () => {
    const xml = buildIndeedFeed({ ...base, jobs: [{ ...job, indeed_mode: 'redirect' as const }] });
    expect(xml).not.toContain('indeed-apply-data');
    expect(xml).toContain('/apply/test-gmbh/vertrieb?src=indeed');
  });

  it('cdata escapt "]]>"', () => {
    expect(cdata('a]]>b')).toBe('<![CDATA[a]]]]><![CDATA[>b]]>');
  });
});
