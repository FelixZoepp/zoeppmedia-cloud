import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isInternalUser } from '@/lib/admin';

export async function GET() {
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch all video views
  const { data: views, error: viewsError } = await admin
    .from('video_views')
    .select('agency_id, viewed_at');

  if (viewsError) {
    return NextResponse.json({ error: viewsError.message }, { status: 500 });
  }

  // Build per-agency stats
  const agencyMap: Record<string, { links: number; views: number }> = {};
  for (const v of views ?? []) {
    if (!agencyMap[v.agency_id]) {
      agencyMap[v.agency_id] = { links: 0, views: 0 };
    }
    agencyMap[v.agency_id].links += 1;
    if (v.viewed_at) {
      agencyMap[v.agency_id].views += 1;
    }
  }

  // Fetch agency names
  const agencyIds = Object.keys(agencyMap);
  let nameMap: Record<string, string> = {};

  if (agencyIds.length > 0) {
    const { data: agencies } = await admin
      .from('agencies')
      .select('id, name')
      .in('id', agencyIds);

    for (const a of agencies ?? []) {
      nameMap[a.id] = a.name;
    }
  }

  const totalLinks = views?.length || 0;
  const totalViews = views?.filter((v) => v.viewed_at !== null).length || 0;
  const viewRate = totalLinks > 0 ? Math.round((totalViews / totalLinks) * 100) : 0;

  const byAgency = agencyIds.map((agencyId) => {
    const stats = agencyMap[agencyId];
    return {
      agency_id: agencyId,
      agency_name: nameMap[agencyId] ?? 'Unbekannt',
      links: stats.links,
      views: stats.views,
      rate: stats.links > 0 ? Math.round((stats.views / stats.links) * 100) : 0,
    };
  });

  return NextResponse.json({
    total_links: totalLinks,
    total_views: totalViews,
    view_rate: viewRate,
    by_agency: byAgency,
  });
}
