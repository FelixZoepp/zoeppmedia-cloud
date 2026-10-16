import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/** Funnel-Datei eines Bewerbers anzeigen: Zugriff prüfen, dann auf eine kurzlebige signierte URL weiterleiten */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const { id, docId } = await params;
  const svc = createAdminClient();
  const { data: c } = await svc.from('candidates').select('agency_id').eq('id', id).maybeSingle();
  const agencyId = (c as { agency_id: string } | null)?.agency_id;
  if (!agencyId) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  const eigene = await getEffectiveAgencyId();
  if (!isInternal(user.role) && eigene !== agencyId) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });

  const { data: doc } = await svc
    .from('documents')
    .select('storage_path, application:applications!inner(candidate_id)')
    .eq('id', docId)
    .eq('agency_id', agencyId)
    .maybeSingle();
  const d = doc as { storage_path: string; application: { candidate_id: string } | { candidate_id: string }[] } | null;
  const kandidat = Array.isArray(d?.application) ? d?.application[0]?.candidate_id : d?.application?.candidate_id;
  if (!d || kandidat !== id) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const { data: signed } = await svc.storage.from('candidate-resumes').createSignedUrl(d.storage_path, 600);
  if (!signed?.signedUrl) return NextResponse.json({ error: 'Datei nicht verfügbar' }, { status: 404 });
  return NextResponse.redirect(signed.signedUrl, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
