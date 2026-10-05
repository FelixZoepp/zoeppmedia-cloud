import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isOwnStorageUrl } from '@/lib/branding/logo';

/**
 * Kunden-Logo setzen/entfernen (gespeichert in agencies.settings.logo_url).
 * Kunden ändern ihr eigenes Logo, interne Nutzer jedes (agency_id im Body).
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { agency_id?: string; logo_url?: string | null };
  let agencyId: string | null;
  if (isInternal(user.role)) {
    agencyId = body.agency_id ?? (await getEffectiveAgencyId());
  } else if (user.role === 'agency_owner' || user.role === 'agency_member') {
    agencyId = user.agency_id;
  } else {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  }
  if (!agencyId) return NextResponse.json({ error: 'Kein Kunde gewählt' }, { status: 400 });

  const logo = body.logo_url ?? null;
  if (logo !== null && (typeof logo !== 'string' || !isOwnStorageUrl(logo))) {
    return NextResponse.json({ error: 'Ungültige Bild-URL' }, { status: 400 });
  }

  const svc = createAdminClient();
  const { data: agency, error } = await svc.from('agencies').select('settings').eq('id', agencyId).maybeSingle();
  if (error || !agency) return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });

  const settings = { ...((agency.settings as Record<string, unknown>) ?? {}) };
  if (logo) settings.logo_url = logo;
  else delete settings.logo_url;
  const { error: upErr } = await svc.from('agencies').update({ settings }).eq('id', agencyId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ logo_url: logo });
}
