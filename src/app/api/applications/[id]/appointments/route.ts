import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/applications/[id]/appointments
 *
 * Gibt Recruiting-Termine (Phase-4-appointments) zur Bewerbung zurück,
 * neueste zuerst. Agency-gescoped.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const supabase = await createServerClient();

  const { data: app } = await supabase
    .from('applications')
    .select('id')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single();

  if (!app) return NextResponse.json({ error: 'Bewerbung nicht gefunden' }, { status: 404 });

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, starts_at, ends_at, type, location, status, created_at')
    .eq('application_id', id)
    .eq('agency_id', agencyId)
    .order('starts_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('[appointments] Fehler beim Laden der Termine:', error.message);
    return NextResponse.json({ error: 'Termine konnten nicht geladen werden' }, { status: 500 });
  }

  return NextResponse.json({ appointments: appointments ?? [] });
}
