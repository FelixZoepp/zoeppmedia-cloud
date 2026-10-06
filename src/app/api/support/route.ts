import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { erstelleAnfrage, ladeAnfragen, pruefeAnfrage } from '@/lib/support/anfragen';

/** GET: Anfragen der eigenen Agentur · POST: neue Anfrage (Frage/Problem/Wunsch/Interesse) */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Kunden-Cloud geöffnet' }, { status: 400 });
  try {
    const anfragen = await ladeAnfragen(createAdminClient(), { agencyId });
    return NextResponse.json(
      anfragen.map((a) => ({ id: a.id, art: a.art, thema: a.thema, nachricht: a.nachricht, empfehlung_id: a.empfehlung_id, status: a.status, antwort: a.antwort, created_at: a.created_at, updated_at: a.updated_at })),
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Kunden-Cloud geöffnet' }, { status: 400 });
  const p = pruefeAnfrage(await req.json().catch(() => ({})));
  if (!p.ok) return NextResponse.json({ error: p.fehler }, { status: 400 });
  try {
    const { id } = await erstelleAnfrage(createAdminClient(), {
      agencyId,
      userId: user.id,
      art: p.art,
      thema: p.thema,
      nachricht: p.nachricht,
      empfehlungId: p.empfehlungId,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Anfrage konnte nicht gesendet werden' }, { status: 500 });
  }
}
