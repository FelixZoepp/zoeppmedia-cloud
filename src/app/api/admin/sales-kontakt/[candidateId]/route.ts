import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';

/**
 * Sales-Inbox: Kontakt von Hand als Kunde (Agentur) oder Lead markieren.
 * GET → aktuelle Markierung + Kundenliste · PATCH { kunde_agency_id: string | null }
 * Eine manuelle Markierung überschreibt die automatische Zuordnung nicht mehr (kunde_manuell).
 */
async function ladeKontakt(candidateId: string) {
  const svc = createAdminClient();
  const { data } = await svc
    .from('candidates')
    .select('id, kunde_agency_id, kunde_manuell')
    .eq('id', candidateId)
    .eq('agency_id', SALES_AGENCY_ID)
    .maybeSingle();
  return { svc, kontakt: data as { id: string; kunde_agency_id: string | null; kunde_manuell: boolean | null } | null };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Nicht erlaubt' }, { status: 403 });
  const { candidateId } = await params;
  const { svc, kontakt } = await ladeKontakt(candidateId);
  if (!kontakt) return NextResponse.json({ error: 'Kontakt nicht gefunden' }, { status: 404 });

  const { data: agencies } = await svc
    .from('agencies')
    .select('id, name')
    .not('id', 'in', `(${[...HIDDEN_AGENCY_IDS, SALES_AGENCY_ID].join(',')})`)
    .order('name');
  return NextResponse.json({
    kunde_agency_id: kontakt.kunde_agency_id,
    kunde_manuell: !!kontakt.kunde_manuell,
    kunden: agencies ?? [],
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Nicht erlaubt' }, { status: 403 });
  const { candidateId } = await params;
  const body = (await request.json().catch(() => ({}))) as { kunde_agency_id?: string | null };
  const ziel = typeof body.kunde_agency_id === 'string' && body.kunde_agency_id ? body.kunde_agency_id : null;

  const { svc, kontakt } = await ladeKontakt(candidateId);
  if (!kontakt) return NextResponse.json({ error: 'Kontakt nicht gefunden' }, { status: 404 });

  if (ziel) {
    const { data: ag } = await svc.from('agencies').select('id').eq('id', ziel).maybeSingle();
    if (!ag || ziel === SALES_AGENCY_ID) return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 400 });
  }

  const { error } = await svc
    .from('candidates')
    .update({ kunde_agency_id: ziel, kunde_manuell: true })
    .eq('id', candidateId)
    .eq('agency_id', SALES_AGENCY_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, kunde_agency_id: ziel });
}
