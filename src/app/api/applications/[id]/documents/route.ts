import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/applications/[id]/documents
 *
 * Liefert alle Dokumente einer Bewerbung inkl. signierter Download-URL.
 * Graceful degradation: Falls die documents-Tabelle noch nicht migriert wurde,
 * wird eine leere Liste zurückgegeben (console.warn).
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

  // Fetch documents — graceful degradation if table not yet migrated
  let docs: Array<{
    id: string;
    application_id: string;
    storage_path: string;
    mime: string;
    size: number;
    origin: string;
    created_at: string;
    signed_url?: string | null;
  }> = [];

  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, application_id, storage_path, mime, size, origin, created_at')
      .eq('application_id', id)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[documents] Tabelle nicht verfügbar (Migration ausstehend):', error.message);
      return NextResponse.json([]);
    }

    // Generate signed URLs for each document
    docs = await Promise.all(
      (data ?? []).map(async (doc) => {
        const { data: signed } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.storage_path, 3600);
        return { ...doc, signed_url: signed?.signedUrl ?? null };
      })
    );
  } catch (err) {
    console.warn('[documents] Fehler beim Laden:', err);
  }

  return NextResponse.json(docs);
}
