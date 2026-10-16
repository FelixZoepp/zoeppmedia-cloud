import { describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';
import { legeFunnelLeadAn } from '../leads';

vi.mock('@/lib/pipeline/get-stages', () => ({ getStagesForAgency: vi.fn(async () => [{ id: 'st1' }]) }));
vi.mock('@/lib/candidates/find-duplicate', () => ({ findDuplicateCandidate: vi.fn(async () => null) }));
vi.mock('@/lib/candidates/blacklist-check', () => ({ checkBlacklist: vi.fn(async () => ({ is_blacklisted: false })) }));
vi.mock('@/lib/automations/fire', () => ({ fireEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/activity/log', () => ({ logActivity: vi.fn(async () => undefined) }));

const lead = (utm: { campaign: string | null; adset?: string | null }) => ({
  name: 'Max',
  email: 'max@example.org',
  phone: null,
  funnelName: 'Funnel',
  automationen: false,
  utm: { campaign: utm.campaign, adset: utm.adset ?? null, ad: null, source: 'fb' },
});

describe('legeFunnelLeadAn mit UTM', () => {
  it('speichert Kampagne/Anzeigengruppe und ordnet bei nur einer Stelle automatisch zu', async () => {
    const f = createFakeDb({ jobs: [{ id: 'j1', agency_id: 'a', status: 'active', is_default: true, created_at: '2026-01-01' }] });
    const r = await legeFunnelLeadAn(f.client, 'a', lead({ campaign: '120200001', adset: '120200002' }));
    expect(r.status).toBe('angelegt');
    expect(f.tables.candidates[0]).toMatchObject({ meta_campaign: '120200001', meta_adset: '120200002' });
    expect(f.tables.meta_kampagnen_zuordnung).toEqual([expect.objectContaining({ campaign_id: '120200001', agency_id: 'a', job_id: 'j1', quelle: 'auto' })]);
    expect(f.tables.applications[0]).toMatchObject({ job_id: 'j1' });
  });

  it('nutzt die zugeordnete Stelle für die Bewerbung, legt bei mehreren Stellen nichts automatisch an', async () => {
    const jobs = [
      { id: 'j1', agency_id: 'a', status: 'active', is_default: true, created_at: '2026-01-01' },
      { id: 'j2', agency_id: 'a', status: 'active', is_default: false, created_at: '2026-02-01' },
    ];
    const f = createFakeDb({ jobs, meta_kampagnen_zuordnung: [{ campaign_id: '120200001', agency_id: 'a', job_id: 'j2', quelle: 'manuell' }] });
    await legeFunnelLeadAn(f.client, 'a', lead({ campaign: '120200001' }));
    expect(f.tables.applications[0]).toMatchObject({ job_id: 'j2' });

    const g = createFakeDb({ jobs });
    await legeFunnelLeadAn(g.client, 'a', lead({ campaign: '120200009' }));
    expect(g.tables.meta_kampagnen_zuordnung ?? []).toEqual([]);
  });
});
