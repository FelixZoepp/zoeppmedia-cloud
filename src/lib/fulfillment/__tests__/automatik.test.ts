import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn(async () => undefined),
  createNotificationForInternals: vi.fn(async () => undefined),
}));
vi.mock('@/lib/reports/generate-report', () => ({ generateReport: vi.fn(async () => ({ kpi: 1 })) }));
vi.mock('@/lib/reports/versand', () => ({ versendeReport: vi.fn(async () => ({ ok: true, email: 'chef@muster.de' })) }));
vi.mock('@/lib/pipeline/get-stages', () => ({
  getStagesForAgency: vi.fn(async () => []),
  istEingestelltStage: vi.fn(() => false),
}));

import { createFakeDb } from './fake-db';
import { istAutomatikKunde, automatikAgencyIds } from '../automatik';
import { checkAndGenerateReports } from '@/lib/reports/check-reports';
import { versendeReport } from '@/lib/reports/versand';
import { runGarantieCheck, runVerlaengerungCheck } from '@/lib/garantie/check';

const heute = new Date().toISOString().split('T')[0];
const vor7Tagen = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

describe('Automatik-Schalter', () => {
  it('istAutomatikKunde / automatikAgencyIds lesen agencies.automatik', async () => {
    const { client } = createFakeDb({ agencies: [{ id: 'neu', automatik: true }, { id: 'alt', automatik: false }] });
    expect(await istAutomatikKunde(client as never, 'neu')).toBe(true);
    expect(await istAutomatikKunde(client as never, 'alt')).toBe(false);
    expect(await istAutomatikKunde(client as never, 'gibtsnicht')).toBe(false);
    expect(await automatikAgencyIds(client as never)).toEqual(['neu']);
  });
});

describe('Gate: Tag-7/14-Reports', () => {
  beforeEach(() => vi.mocked(versendeReport).mockClear());

  it('Bestandskunde: Report wird nur generiert, nicht verschickt (wie bisher)', async () => {
    const { client, tables } = createFakeDb({
      agencies: [{ id: 'alt', name: 'Alt GmbH', garantie_start: vor7Tagen, automatik: false }],
      reports: [],
    });
    await checkAndGenerateReports(client as never);
    expect(tables.reports).toHaveLength(1);
    expect(tables.reports[0].status).toBe('generiert');
    expect(versendeReport).not.toHaveBeenCalled();
  });

  it('Automatik-Kunde: Report geht automatisch raus', async () => {
    const { client } = createFakeDb({
      agencies: [{ id: 'neu', name: 'Neu GmbH', garantie_start: vor7Tagen, automatik: true }],
      reports: [],
    });
    await checkAndGenerateReports(client as never);
    expect(versendeReport).toHaveBeenCalledTimes(1);
  });
});

describe('Gate: Garantie und Verlängerung', () => {
  it('Bestandskunden werden weder berechnet noch erinnert', async () => {
    const ende = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    const { client, tables } = createFakeDb({
      agencies: [{ id: 'alt', name: 'Alt GmbH', automatik: false, garantie_start: heute, garantie_ende: ende, garantie_ziel_starter: 5, laufzeit_monate: 6, fulfillment_phase: 'continuity' }],
      internal_tasks: [],
    });
    const g = await runGarantieCheck(client as never);
    const v = await runVerlaengerungCheck(client as never);
    expect(JSON.stringify(g)).not.toMatch(/"berechnet":[1-9]/);
    expect(JSON.stringify(v)).not.toMatch(/"aufgaben":[1-9]/);
    expect(tables.internal_tasks).toHaveLength(0);
    expect(tables.agencies[0].garantie_ampel).toBeUndefined();
  });
});
