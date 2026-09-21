import type { SupabaseClient } from '@supabase/supabase-js';

// Geschätzte USD-Preise pro 1 Mio Token (P6-R4)
const MODEL_PRICES: Array<{ match: string; input: number; output: number }> = [
  { match: 'haiku', input: 1, output: 5 },
  { match: 'opus', input: 15, output: 75 },
  { match: 'sonnet', input: 3, output: 15 },
];
const DEFAULT_PRICE = { input: 3, output: 15 };

export function estimateAiCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICES.find((p) => model.includes(p.match)) ?? DEFAULT_PRICE;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

export function yesterdayUtc(now: Date = new Date()): string {
  const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Aggregiert Verbrauch aller Agenturen für einen UTC-Tag in usage_daily (Spec §11). */
export async function aggregateUsageForDay(
  svc: SupabaseClient,
  day: string,
): Promise<{ agencies: number; upserts: number }> {
  const from = `${day}T00:00:00.000Z`;
  const to = `${day}T23:59:59.999Z`;

  const { data: agencies } = await svc.from('agencies').select('id');
  let upserts = 0;

  for (const agency of agencies ?? []) {
    const [msgRes, aiRes] = await Promise.all([
      svc
        .from('messages')
        .select('direction, cost_category')
        .eq('agency_id', agency.id)
        .gte('created_at', from)
        .lte('created_at', to),
      svc
        .from('ai_calls')
        .select('model, input_tokens, output_tokens')
        .eq('agency_id', agency.id)
        .gte('created_at', from)
        .lte('created_at', to),
    ]);

    let messagesOut = 0;
    let messagesIn = 0;
    const byCategory: Record<string, number> = {};
    for (const m of msgRes.data ?? []) {
      if (m.direction === 'out') {
        messagesOut += 1;
        if (m.cost_category) byCategory[m.cost_category] = (byCategory[m.cost_category] ?? 0) + 1;
      } else {
        messagesIn += 1;
      }
    }

    let aiIn = 0;
    let aiOut = 0;
    let aiCost = 0;
    for (const c of aiRes.data ?? []) {
      aiIn += c.input_tokens ?? 0;
      aiOut += c.output_tokens ?? 0;
      aiCost += estimateAiCostUsd(c.model ?? '', c.input_tokens ?? 0, c.output_tokens ?? 0);
    }

    const { error } = await svc.from('usage_daily').upsert(
      {
        agency_id: agency.id,
        day,
        messages_out: messagesOut,
        messages_in: messagesIn,
        templates_by_category: byCategory,
        ai_input_tokens: aiIn,
        ai_output_tokens: aiOut,
        ai_cost_usd: Math.round(aiCost * 10000) / 10000,
      },
      { onConflict: 'agency_id,day' },
    );
    if (!error) upserts += 1;
  }

  return { agencies: (agencies ?? []).length, upserts };
}
