import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dialerScope, imScope } from '@/lib/dialer/scope';
import { SPERRE_MINUTEN } from '@/lib/dialer/queue';

/**
 * POST /api/dialer/lock { candidate_id, action: 'open' | 'release' }
 * Sperrt einen Bewerber für SPERRE_MINUTEN, solange er im Anruf-Modus geöffnet ist,
 * damit Kunde und Innendienst nicht dieselbe Person gleichzeitig anrufen.
 */
export async function POST(req: NextRequest) {
  const svc = createAdminClient();
  const scope = await dialerScope(svc, { intern: req.nextUrl.searchParams.get('modus') === 'intern' });
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!scope.schreiben) return NextResponse.json({ error: 'Nur Lesezugriff' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { candidate_id?: string; action?: string };
  if (!body.candidate_id || (body.action !== 'open' && body.action !== 'release')) {
    return NextResponse.json({ error: 'candidate_id und action (open|release) erforderlich' }, { status: 400 });
  }

  const { data: c } = await svc
    .from('candidates')
    .select('id, agency_id, locked_by, locked_until')
    .eq('id', body.candidate_id)
    .maybeSingle();
  const kandidat = c as { id: string; agency_id: string; locked_by: string | null; locked_until: string | null } | null;
  if (!kandidat || !imScope(scope, kandidat.agency_id)) return NextResponse.json({ error: 'Bewerber nicht gefunden' }, { status: 404 });

  const jetzt = new Date();
  const userId = scope.user.id;

  if (body.action === 'release') {
    // nur die eigene Sperre lösen
    if (kandidat.locked_by === userId) {
      await svc.from('candidates').update({ locked_by: null, locked_until: null }).eq('id', kandidat.id).eq('locked_by', userId);
    }
    return NextResponse.json({ ok: true });
  }

  const fremdGesperrt =
    kandidat.locked_by && kandidat.locked_by !== userId && kandidat.locked_until && new Date(kandidat.locked_until) > jetzt;
  if (fremdGesperrt) {
    const { data: u } = await svc.from('users').select('name').eq('id', kandidat.locked_by!).maybeSingle();
    return NextResponse.json(
      { error: `${(u as { name: string } | null)?.name ?? 'Jemand'} ruft diesen Bewerber gerade an.`, locked_until: kandidat.locked_until },
      { status: 409 },
    );
  }

  const bis = new Date(jetzt.getTime() + SPERRE_MINUTEN * 60_000).toISOString();
  // Bedingtes Update: verhindert, dass zwei gleichzeitig dieselbe Person öffnen
  const { data: gesetzt } = await svc
    .from('candidates')
    .update({ locked_by: userId, locked_until: bis })
    .eq('id', kandidat.id)
    .or(`locked_by.is.null,locked_by.eq.${userId},locked_until.is.null,locked_until.lt.${jetzt.toISOString()}`)
    .select('id');
  if (!gesetzt?.length) return NextResponse.json({ error: 'Jemand ruft diesen Bewerber gerade an.' }, { status: 409 });
  return NextResponse.json({ ok: true, locked_until: bis });
}
