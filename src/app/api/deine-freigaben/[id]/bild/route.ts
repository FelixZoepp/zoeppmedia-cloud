import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { waehleVariante } from '@/lib/ads/bilder';

/** POST { pfad } – Kunde wählt für eine Ad in seiner Freigabe eine der KI-Bildvarianten */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const agencyId = await getEffectiveAgencyId();
  if (!user || !agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  // wie die Freigabe selbst: nur Inhaber (oder intern im Kunden-Login)
  if (user.role !== 'agency_owner' && !isInternal(user.role)) {
    return NextResponse.json({ error: 'Nur der Inhaber kann das Bild auswählen' }, { status: 403 });
  }
  const { id } = await params;
  const { pfad } = (await req.json().catch(() => ({}))) as { pfad?: string };
  if (!pfad) return NextResponse.json({ error: 'pfad fehlt' }, { status: 400 });
  try {
    await waehleVariante(createAdminClient(), id, pfad, { kundeAgencyId: agencyId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 400 });
  }
}
