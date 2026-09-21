import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * GET /api/applications/[id]/notes
 *
 * Gibt alle Notizen zurück, die entweder:
 * - application_id = dieser Bewerbung zugeordnet sind, ODER
 * - application_id IS NULL (Kandidaten-globale Notizen zum selben Kandidaten)
 *
 * Graceful degradation: Falls application_id-Spalte noch nicht existiert,
 * werden alle Notizen des Kandidaten zurückgegeben (console.warn).
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

  // Verify the application belongs to this agency and get candidate_id
  const { data: app } = await supabase
    .from('applications')
    .select('id, candidate_id')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single();

  if (!app) return NextResponse.json({ error: 'Bewerbung nicht gefunden' }, { status: 404 });

  try {
    // Notizen der Bewerbung + kandidatenweite Notizen (ohne application_id)
    const { data, error } = await supabase
      .from('notes')
      .select('*, user:users(name)')
      .eq('candidate_id', app.candidate_id)
      .or(`application_id.eq.${id},application_id.is.null`)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[notes] Fehler (ggf. Migration ausstehend):', error.message);
      // Fallback: alle Kandidaten-Notizen ohne Filter
      const { data: fallback } = await supabase
        .from('notes')
        .select('*, user:users(name)')
        .eq('candidate_id', app.candidate_id)
        .order('created_at', { ascending: false });
      return NextResponse.json(fallback ?? []);
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.warn('[notes] Unerwarteter Fehler:', err);
    return NextResponse.json([]);
  }
}

const noteSchema = z.object({
  text: z.string().min(1, 'Notiz darf nicht leer sein'),
});

/**
 * POST /api/applications/[id]/notes
 *
 * Erstellt eine neue Notiz mit application_id der gewählten Bewerbung.
 * Graceful degradation: Falls application_id-Spalte fehlt, wird ohne sie eingefügt.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createServerClient();

  const { data: app } = await supabase
    .from('applications')
    .select('id, candidate_id')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single();

  if (!app) return NextResponse.json({ error: 'Bewerbung nicht gefunden' }, { status: 404 });

  // Versuche mit application_id einzufügen; bei Fehler ohne (graceful degradation)
  const { data: note, error } = await supabase
    .from('notes')
    .insert({
      candidate_id: app.candidate_id,
      user_id: user.id,
      text: parsed.data.text.trim(),
      application_id: id,
    })
    .select('*, user:users(name)')
    .single();

  if (error) {
    console.warn('[notes POST] Fehler mit application_id (ggf. Migration ausstehend):', error.message);
    // Fallback ohne application_id
    const { data: fallbackNote, error: fallbackErr } = await supabase
      .from('notes')
      .insert({
        candidate_id: app.candidate_id,
        user_id: user.id,
        text: parsed.data.text.trim(),
      })
      .select('*, user:users(name)')
      .single();

    if (fallbackErr) {
      return NextResponse.json({ error: 'Notiz konnte nicht gespeichert werden.' }, { status: 500 });
    }
    return NextResponse.json(fallbackNote, { status: 201 });
  }

  return NextResponse.json(note, { status: 201 });
}
