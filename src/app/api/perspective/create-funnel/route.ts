import { NextRequest, NextResponse, after } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { baueFunnelBisFertig, starteFunnelBau } from '@/lib/perspective/funnel-bau';

export const maxDuration = 300;

/** Funnel für einen Kunden automatisch in Perspective bauen (gleich wie /api/admin/agencies/[id]/funnel-bau). */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { agency_id, auto_veroeffentlichen } = body as { agency_id?: string; auto_veroeffentlichen?: boolean };
  if (!agency_id) {
    return NextResponse.json({ error: 'agency_id ist erforderlich' }, { status: 400 });
  }

  const ergebnis = await starteFunnelBau(createAdminClient(), agency_id, { autoVeroeffentlichen: auto_veroeffentlichen ?? true });
  if (!ergebnis.ok) return NextResponse.json({ error: ergebnis.meldung, grund: ergebnis.grund }, { status: 400 });
  if (ergebnis.neu) after(() => baueFunnelBisFertig(createAdminClient(), ergebnis.funnel.id).then(() => undefined));
  return NextResponse.json(ergebnis.funnel);
}
