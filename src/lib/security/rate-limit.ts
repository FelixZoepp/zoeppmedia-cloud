import type { SupabaseClient } from '@supabase/supabase-js';

export async function checkRateLimit(
  svc: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const now = new Date();
    const { data, error } = await svc
      .from('rate_limit_counters')
      .select('window_start, count')
      .eq('key', key)
      .maybeSingle();
    if (error) return true; // fail-open (Ruling P7-R3)

    const windowStart = data ? new Date(data.window_start) : null;
    const expired =
      !windowStart || now.getTime() - windowStart.getTime() > windowSeconds * 1000;

    if (!data || expired) {
      await svc
        .from('rate_limit_counters')
        .upsert({ key, window_start: now.toISOString(), count: 1 }, { onConflict: 'key' });
      return true;
    }
    if (data.count >= limit) return false;
    await svc
      .from('rate_limit_counters')
      .update({ count: data.count + 1 })
      .eq('key', key);
    return true;
  } catch {
    return true; // fail-open
  }
}
