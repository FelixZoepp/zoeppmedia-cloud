import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/applications/[id]/answers
 *
 * Gibt alle application_answers einer Bewerbung zurück.
 * Die application_answers-Tabelle existiert seit Migration 20260921000002
 * und ist zum Zeitpunkt der Auslieferung verfügbar.
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

  // Verify the application belongs to this agency
  const { data: app } = await supabase
    .from('applications')
    .select('id')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single();

  if (!app) return NextResponse.json({ error: 'Bewerbung nicht gefunden' }, { status: 404 });

  const { data, error } = await supabase
    .from('application_answers')
    .select('id, application_id, question_key, question_text, answer_raw, origin')
    .eq('application_id', id)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[answers] Fehler beim Laden:', error.message);
    return NextResponse.json([]);
  }

  return NextResponse.json(data ?? []);
}
