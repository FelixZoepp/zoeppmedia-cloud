import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { ladeStellenKosten, zeitraum } from '@/lib/kosten/stellen';

/** Kosten je Stelle für die Kundenakte: ?tage=30 (7–365) */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || !isInternal(u.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
  const tage = Math.min(Math.max(Number(req.nextUrl.searchParams.get('tage')) || 30, 7), 365);
  const kosten = await ladeStellenKosten(createAdminClient(), id, zeitraum(tage));
  return NextResponse.json({ kosten, tage });
}
