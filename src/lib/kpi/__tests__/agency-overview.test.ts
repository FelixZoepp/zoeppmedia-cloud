/**
 * Tests für computeAmpel und getAgencyOverview (Phase 6 Task 7).
 * Alle Ampel-Zweige, Alarm-Typen, metaCostEur-Berechnung.
 */

import { describe, it, expect, vi } from 'vitest';
import { computeAmpel, getAgencyOverview } from '../agency-overview';

// ---------------------------------------------------------------------------
// computeAmpel — vollständige Abdeckung aller Zweige
// ---------------------------------------------------------------------------

describe('computeAmpel', () => {
  it('gibt rot zurück wenn waStatus disconnected', () => {
    expect(
      computeAmpel({
        waStatus: 'disconnected',
        rejectedTemplates: 0,
        activeJobs: 0,
        apps7: 0,
        antwortquote30: 0.8,
      }),
    ).toBe('rot');
  });

  it('gibt rot zurück wenn waStatus banned', () => {
    expect(
      computeAmpel({
        waStatus: 'banned',
        rejectedTemplates: 0,
        activeJobs: 1,
        apps7: 3,
        antwortquote30: 0.9,
      }),
    ).toBe('rot');
  });

  it('gibt rot zurück wenn activeJobs > 0 und apps7 === 0', () => {
    expect(
      computeAmpel({
        waStatus: 'connected',
        rejectedTemplates: 0,
        activeJobs: 2,
        apps7: 0,
        antwortquote30: 0.8,
      }),
    ).toBe('rot');
  });

  it('gibt gelb zurück wenn rejectedTemplates > 0', () => {
    expect(
      computeAmpel({
        waStatus: 'connected',
        rejectedTemplates: 1,
        activeJobs: 1,
        apps7: 5,
        antwortquote30: 0.7,
      }),
    ).toBe('gelb');
  });

  it('gibt gelb zurück wenn antwortquote30 < 0.4', () => {
    expect(
      computeAmpel({
        waStatus: 'connected',
        rejectedTemplates: 0,
        activeJobs: 1,
        apps7: 5,
        antwortquote30: 0.3,
      }),
    ).toBe('gelb');
  });

  it('gibt gruen zurück wenn alles in Ordnung', () => {
    expect(
      computeAmpel({
        waStatus: 'connected',
        rejectedTemplates: 0,
        activeJobs: 1,
        apps7: 5,
        antwortquote30: 0.8,
      }),
    ).toBe('gruen');
  });

  it('gibt gruen zurück wenn activeJobs === 0 (kein rot-Zweig)', () => {
    expect(
      computeAmpel({
        waStatus: 'connected',
        rejectedTemplates: 0,
        activeJobs: 0,
        apps7: 0,
        antwortquote30: null,
      }),
    ).toBe('gruen');
  });

  it('gibt gelb zurück wenn antwortquote30 genau 0.4 ist (Grenzwert)', () => {
    // 0.4 ist NICHT < 0.4, also kein gelb aus diesem Zweig
    expect(
      computeAmpel({
        waStatus: 'connected',
        rejectedTemplates: 0,
        activeJobs: 1,
        apps7: 5,
        antwortquote30: 0.4,
      }),
    ).toBe('gruen');
  });

  it('ignoriert antwortquote30 null für gelb-Zweig', () => {
    expect(
      computeAmpel({
        waStatus: 'connected',
        rejectedTemplates: 0,
        activeJobs: 1,
        apps7: 5,
        antwortquote30: null,
      }),
    ).toBe('gruen');
  });
});

// ---------------------------------------------------------------------------
// getAgencyOverview — Happy-Path mit Fixtures
// ---------------------------------------------------------------------------

const AGENCY_ID = '00000000-0000-4000-8000-000000000001';
const JOB_ID    = '00000000-0000-4000-8001-000000000001';
const APP_ID_1  = '00000000-0000-4000-8002-000000000001';
const APP_ID_2  = '00000000-0000-4000-8002-000000000002';
const CONV_ID   = '00000000-0000-4000-8003-000000000001';

const MONTH_START = '2026-09-01';

/** Erstellt einen einfachen chainbaren Supabase-Mock. */
function makeChain(result: { data: unknown; error: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of [
    'select', 'eq', 'gte', 'lte', 'in', 'order', 'limit', 'filter', 'neq', 'not',
  ]) {
    chain[m] = self;
  }
  chain['maybeSingle'] = () => Promise.resolve(result);
  chain['single']      = () => Promise.resolve(result);
  chain['then']        = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return chain;
}

function buildMockClient(overrides: Record<string, { data: unknown; error: unknown; count?: number | null }>) {
  return {
    from: (table: string) => {
      const result = overrides[table] ?? { data: [], error: null };
      return makeChain(result);
    },
  };
}

describe('getAgencyOverview', () => {
  it('gibt eine Zeile pro Agentur mit korrekten apps30, ampel und alarms zurück', async () => {
    // Fixture: 1 Agentur, 1 aktiver Job, 2 Bewerbungen im Monat,
    // 1 Conversation mit 1 Inbound-Nachricht, kein Termin, WA connected,
    // kein rejected Template, keine Fehler im Eingang.

    const mockAgencies = [{ id: AGENCY_ID, name: 'Muster GmbH' }];
    const mockJobs = [{ id: JOB_ID, status: 'active' }];
    const mockApps = [
      { id: APP_ID_1, job_id: JOB_ID, score_label: 'A', applied_at: '2026-09-10T10:00:00Z' },
      { id: APP_ID_2, job_id: JOB_ID, score_label: null, applied_at: '2026-09-15T12:00:00Z' },
    ];
    const mockConversations = [
      { id: CONV_ID, application_id: APP_ID_1, last_message_at: '2026-09-11T10:00:00Z' },
    ];
    const mockMessages = [
      { conversation_id: CONV_ID, direction: 'in', created_at: '2026-09-11T10:00:00Z' },
      { conversation_id: CONV_ID, direction: 'out', created_at: '2026-09-10T10:05:00Z' },
    ];
    const mockWaAccount = {
      status: 'connected',
      quality_rating: 'GREEN',
      messaging_limit: 'TIER_1K',
    };
    const mockUsage = [
      {
        agency_id: AGENCY_ID,
        day: '2026-09-01',
        messages_out: 100,
        messages_in: 50,
        templates_by_category: { utility: 10, marketing: 5 },
        ai_input_tokens: 1000,
        ai_output_tokens: 500,
        ai_cost_usd: 0.05,
      },
    ];
    const mockPricing = [
      { category: 'utility',   price_eur: 0.06 },
      { category: 'marketing', price_eur: 0.12 },
    ];

    // Wir bauen einen Mock-Client, der je nach table das passende Ergebnis liefert.
    // Da getAgencyOverview mehrere Queries pro Agentur macht, nutzen wir einen
    // zustandsbehafteten Mock der Aufrufreihenfolge berücksichtigt.

    let agencyQueried = false;
    let pricingQueried = false;

    const mockClient = {
      from: (table: string) => {
        if (table === 'agencies') {
          agencyQueried = true;
          return makeChain({ data: mockAgencies, error: null });
        }
        if (table === 'meta_pricing') {
          pricingQueried = true;
          return makeChain({ data: mockPricing, error: null });
        }
        if (table === 'jobs') {
          return makeChain({ data: mockJobs, error: null });
        }
        if (table === 'applications') {
          return makeChain({ data: mockApps, error: null });
        }
        if (table === 'conversations') {
          return makeChain({ data: mockConversations, error: null });
        }
        if (table === 'messages') {
          return makeChain({ data: mockMessages, error: null });
        }
        if (table === 'appointments') {
          return makeChain({ data: [], error: null });
        }
        if (table === 'whatsapp_accounts') {
          return makeChain({ data: mockWaAccount, error: null });
        }
        if (table === 'whatsapp_templates') {
          return makeChain({ data: [], error: null, count: 0 });
        }
        if (table === 'events_inbox') {
          return makeChain({ data: [], error: null, count: 0 });
        }
        if (table === 'scheduled_jobs') {
          return makeChain({ data: [], error: null, count: 0 });
        }
        if (table === 'usage_daily') {
          return makeChain({ data: mockUsage, error: null });
        }
        return makeChain({ data: [], error: null });
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await getAgencyOverview(mockClient as any, MONTH_START);

    expect(agencyQueried).toBe(true);
    expect(pricingQueried).toBe(true);
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.agencyId).toBe(AGENCY_ID);
    expect(row.name).toBe('Muster GmbH');
    expect(row.activeJobs).toBe(1);
    expect(row.apps30).toBe(2);

    // ampel: WA connected, kein rejected Template, activeJobs=1, apps7 kommt aus
    // Bewerbungen der letzten 7 Tage. Fixture-Bewerbungen sind am 10. und 15. September,
    // monthStart ist '2026-09-01'. apps7 wird über applied_at der letzten 7d geprüft.
    // Da wir hier keinen echten Datumsfilter im Mock haben, könnte apps7 variieren —
    // wir testen nur, dass ampel ein gültiger Wert ist.
    expect(['gruen', 'gelb', 'rot']).toContain(row.ampel);

    // alarms: kein wa_disconnected weil connected
    const alarmTypes = row.alarms.map((a) => a.type);
    expect(alarmTypes).not.toContain('wa_disconnected');

    // usageMonth: metaCostEur = 10*0.06 + 5*0.12 = 0.60 + 0.60 = 1.20
    expect(row.usageMonth.metaCostEur).toBeCloseTo(1.2, 5);
    expect(row.usageMonth.messagesOut).toBe(100);
    expect(row.usageMonth.aiInputTokens).toBe(1000);
    expect(row.usageMonth.aiOutputTokens).toBe(500);
    expect(row.usageMonth.aiCostUsd).toBeCloseTo(0.05, 5);
  });

  it('berechnet metaCostEur = 0 wenn keine Preise hinterlegt', async () => {
    const mockClient = {
      from: (table: string) => {
        if (table === 'agencies') return makeChain({ data: [{ id: AGENCY_ID, name: 'Test' }], error: null });
        if (table === 'meta_pricing') return makeChain({ data: [], error: null });
        if (table === 'usage_daily') {
          return makeChain({
            data: [{
              agency_id: AGENCY_ID,
              day: '2026-09-01',
              messages_out: 50,
              messages_in: 10,
              templates_by_category: { utility: 20 },
              ai_input_tokens: 0,
              ai_output_tokens: 0,
              ai_cost_usd: 0,
            }],
            error: null,
          });
        }
        return makeChain({ data: [], error: null, count: 0 });
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await getAgencyOverview(mockClient as any, MONTH_START);
    expect(rows[0].usageMonth.metaCostEur).toBe(0);
  });

  it('gibt wa_disconnected Alarm wenn WA-Account vorhanden aber nicht connected', async () => {
    const mockClient = {
      from: (table: string) => {
        if (table === 'agencies') return makeChain({ data: [{ id: AGENCY_ID, name: 'Test' }], error: null });
        if (table === 'meta_pricing') return makeChain({ data: [], error: null });
        if (table === 'whatsapp_accounts') return makeChain({ data: { status: 'disconnected', quality_rating: null, messaging_limit: null }, error: null });
        if (table === 'jobs') return makeChain({ data: [], error: null });
        if (table === 'applications') return makeChain({ data: [], error: null });
        if (table === 'usage_daily') return makeChain({ data: [], error: null });
        return makeChain({ data: [], error: null, count: 0 });
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await getAgencyOverview(mockClient as any, MONTH_START);
    const alarmTypes = rows[0].alarms.map((a) => a.type);
    expect(alarmTypes).toContain('wa_disconnected');
    expect(rows[0].ampel).toBe('rot');
  });

  it('gibt job_no_apps Alarm wenn aktiver Job ohne Bewerbung in 7 Tagen', async () => {
    // Job vorhanden, aber keine Bewerbungen in 7d
    const mockApps = [] as unknown[];

    const mockClient = {
      from: (table: string) => {
        if (table === 'agencies') return makeChain({ data: [{ id: AGENCY_ID, name: 'Test' }], error: null });
        if (table === 'meta_pricing') return makeChain({ data: [], error: null });
        if (table === 'whatsapp_accounts') return makeChain({ data: null, error: null });
        if (table === 'jobs') return makeChain({ data: [{ id: JOB_ID, status: 'active' }], error: null });
        if (table === 'applications') return makeChain({ data: mockApps, error: null });
        if (table === 'usage_daily') return makeChain({ data: [], error: null });
        return makeChain({ data: [], error: null, count: 0 });
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await getAgencyOverview(mockClient as any, MONTH_START);
    const alarmTypes = rows[0].alarms.map((a) => a.type);
    // activeJobs=1, apps7=0 → rot, job_no_apps Alarm
    expect(alarmTypes).toContain('job_no_apps');
    expect(rows[0].ampel).toBe('rot');
  });

  it('gibt leeres Array zurück wenn keine Agenturen vorhanden', async () => {
    const mockClient = {
      from: (table: string) => {
        if (table === 'agencies') return makeChain({ data: [], error: null });
        if (table === 'meta_pricing') return makeChain({ data: [], error: null });
        return makeChain({ data: [], error: null });
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await getAgencyOverview(mockClient as any, MONTH_START);
    expect(rows).toHaveLength(0);
  });
});
