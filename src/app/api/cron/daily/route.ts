import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { detectProblemsForAgency } from '@/lib/problems/detect';

// Vercel Cron: GET /api/cron/daily at 08:00 UTC daily
// Also accepts POST for manual triggers

async function runDailyJobs() {
  const supabase = await createServerClient();

  const { data: agencies, error } = await supabase
    .from('agencies')
    .select('id, name');

  if (error) {
    console.error('[cron/daily] Failed to fetch agencies:', error.message);
    return { ok: false, error: error.message };
  }

  const results: Record<string, unknown> = {};

  for (const agency of agencies ?? []) {
    try {
      await detectProblemsForAgency(supabase, agency.id);
      results[agency.id] = { name: agency.name, status: 'ok' };
    } catch (err) {
      console.error(`[cron/daily] detectProblems failed for agency ${agency.id}:`, err);
      results[agency.id] = { name: agency.name, status: 'error' };
    }
  }

  console.log(`[cron/daily] Processed ${agencies?.length ?? 0} agencies at ${new Date().toISOString()}`);
  return { ok: true, processed: agencies?.length ?? 0, results };
}

export async function GET(request: NextRequest) {
  // Verify cron secret when provided
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const result = await runDailyJobs();
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const result = await runDailyJobs();
  return NextResponse.json(result);
}
