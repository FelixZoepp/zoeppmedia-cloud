import { describe, it, expect } from 'vitest';
import { estimateAiCostUsd, yesterdayUtc, aggregateUsageForDay } from '@/lib/usage/aggregate';

describe('estimateAiCostUsd', () => {
  it('berechnet Sonnet-Kosten (3/15 USD pro Mio Token)', () => {
    expect(estimateAiCostUsd('claude-sonnet-4-5', 1_000_000, 1_000_000)).toBeCloseTo(18, 4);
  });
  it('berechnet Haiku-Kosten (1/5 USD pro Mio Token)', () => {
    expect(estimateAiCostUsd('claude-haiku-4-5-20251001', 2_000_000, 0)).toBeCloseTo(2, 4);
  });
  it('fällt bei unbekanntem Modell auf Sonnet-Preise zurück', () => {
    expect(estimateAiCostUsd('gpt-x', 1_000_000, 0)).toBeCloseTo(3, 4);
  });
});

describe('yesterdayUtc', () => {
  it('liefert den Vortag als YYYY-MM-DD', () => {
    expect(yesterdayUtc(new Date('2026-09-21T08:00:00Z'))).toBe('2026-09-20');
  });
  it('geht über Monatsgrenzen', () => {
    expect(yesterdayUtc(new Date('2026-10-01T00:30:00Z'))).toBe('2026-09-30');
  });
});

describe('aggregateUsageForDay', () => {
  it('zählt Nachrichten, Kategorien und Tokens je Agentur und upserted', async () => {
    // Mock: 1 Agentur; messages: 2× out (cost_category 'utility', 'marketing'), 1× in;
    // ai_calls: input 1000 / output 500 (model 'claude-haiku-…')
    const state: { usage_daily: unknown[] } = { usage_daily: [] };

    const makeTable = (table: string) => {
      const chain = {
        eq: (_col: string, _val: string) => ({
          gte: (_c: string, _v: string) => ({
            lte: (_c2: string, _v2: string) => {
              if (table === 'messages') {
                return {
                  data: [
                    { direction: 'out', cost_category: 'utility' },
                    { direction: 'out', cost_category: 'marketing' },
                    { direction: 'in', cost_category: null },
                  ],
                  error: null,
                };
              }
              if (table === 'ai_calls') {
                return {
                  data: [{ model: 'claude-haiku-4-5', input_tokens: 1000, output_tokens: 500 }],
                  error: null,
                };
              }
              return { data: [], error: null };
            },
          }),
        }),
      };
      return {
        select: (_cols: string) => {
          if (table === 'agencies') {
            return { data: [{ id: 'agency-1' }], error: null };
          }
          return chain;
        },
        upsert: (payload: unknown, _opts: unknown) => {
          state.usage_daily.push(payload);
          return { error: null };
        },
      };
    };

    const mockSvc = {
      from: (table: string) => makeTable(table),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const result = await aggregateUsageForDay(mockSvc, '2026-09-20');

    expect(result.agencies).toBe(1);
    expect(result.upserts).toBe(1);

    const row = state.usage_daily[0] as Record<string, unknown>;
    expect(row.agency_id).toBe('agency-1');
    expect(row.day).toBe('2026-09-20');
    expect(row.messages_out).toBe(2);
    expect(row.messages_in).toBe(1);
    expect(row.templates_by_category).toEqual({ utility: 1, marketing: 1 });
    expect(row.ai_input_tokens).toBe(1000);
    expect(row.ai_output_tokens).toBe(500);
    // Haiku: 1000/1_000_000 * 1 + 500/1_000_000 * 5 = 0.001 + 0.0025 = 0.0035
    expect(row.ai_cost_usd).toBeCloseTo(0.0035, 4);
  });

  it('schreibt auch bei 0 Aktivität eine Nullzeile (Monatsübersicht bleibt vollständig)', async () => {
    // Mock: 1 Agentur, keine messages, keine ai_calls → upsert mit Nullwerten
    const state: { usage_daily: unknown[] } = { usage_daily: [] };

    const makeTable = (table: string) => {
      const chain = {
        eq: (_col: string, _val: string) => ({
          gte: (_c: string, _v: string) => ({
            lte: (_c2: string, _v2: string) => ({
              data: [],
              error: null,
            }),
          }),
        }),
      };
      return {
        select: (_cols: string) => {
          if (table === 'agencies') {
            return { data: [{ id: 'agency-2' }], error: null };
          }
          return chain;
        },
        upsert: (payload: unknown, _opts: unknown) => {
          state.usage_daily.push(payload);
          return { error: null };
        },
      };
    };

    const mockSvc = {
      from: (table: string) => makeTable(table),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const result = await aggregateUsageForDay(mockSvc, '2026-09-20');

    expect(result.agencies).toBe(1);
    expect(result.upserts).toBe(1);

    const row = state.usage_daily[0] as Record<string, unknown>;
    expect(row.agency_id).toBe('agency-2');
    expect(row.day).toBe('2026-09-20');
    expect(row.messages_out).toBe(0);
    expect(row.messages_in).toBe(0);
    expect(row.templates_by_category).toEqual({});
    expect(row.ai_input_tokens).toBe(0);
    expect(row.ai_output_tokens).toBe(0);
    expect(row.ai_cost_usd).toBe(0);
  });
});
