import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { syncMetaInsights } from '@/lib/meta/sync';

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { synced, errors } = await syncMetaInsights(supabase);

  return NextResponse.json({ synced, errors: errors.length ? errors : undefined });
}
