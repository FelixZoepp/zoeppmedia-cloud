import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const funnelId = searchParams.get('funnel_id');

  if (!funnelId) {
    return NextResponse.json({ error: 'funnel_id ist erforderlich' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: funnel, error } = await supabase
    .from('perspective_funnels')
    .select('*')
    .eq('id', funnelId)
    .single();

  if (error || !funnel) {
    return NextResponse.json({ error: 'Funnel nicht gefunden' }, { status: 404 });
  }

  // TODO: When Perspective MCP is available at runtime, call get_funnel_stats
  // using funnel.perspective_funnel_id and return live stats.
  // For now return local data only.

  // Count leads generated via Perspective webhook for this funnel's agency
  const { count: leadCount } = await supabase
    .from('candidates')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', funnel.agency_id)
    .eq('source', 'meta');

  return NextResponse.json({
    funnel,
    stats: {
      leads: leadCount ?? 0,
      // Additional live stats available once Perspective MCP is wired:
      // views, starts, completions, conversion_rate
    },
  });
}
