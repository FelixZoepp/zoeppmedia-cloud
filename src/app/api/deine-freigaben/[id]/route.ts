import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { customerDecision } from '@/lib/ads/ads';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const agencyId = await getEffectiveAgencyId();
  if (!user || !agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  const { id } = await params;
  const { aktion, kommentar } = (await req.json().catch(() => ({}))) as { aktion?: string; kommentar?: string };
  if (aktion !== 'freigeben' && aktion !== 'aendern') return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
  try {
    await customerDecision(createAdminClient(), agencyId, id, aktion, user.id, kommentar?.slice(0, 2000));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 400 });
  }
}
