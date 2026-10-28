import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { vollstaendigeAdresse } from '@/lib/appointments/termin-format';

type Kontext = { params: Promise<{ id: string; rundeId: string }> };

async function ladeKontext(ctx: Kontext) {
  const user = await getCurrentUser();
  if (!user) return { fehler: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) };
  if (!canWriteRole(user.role)) return { fehler: NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 }) };
  const agencyId = await getEffectiveAgencyId(user);
  if (!agencyId) return { fehler: NextResponse.json({ error: 'Keine Agentur' }, { status: 403 }) };
  const { id: jobId, rundeId } = await ctx.params;
  const svc = createAdminClient();
  const { data: runde } = await svc.from('vorstellungsrunden')
    .select('id, adresse, hinweis, max_teilnehmer')
    .eq('id', rundeId).eq('job_id', jobId).eq('agency_id', agencyId).maybeSingle();
  if (!runde) return { fehler: NextResponse.json({ error: 'Runde nicht gefunden' }, { status: 404 }) };
  const { data: aktive } = await svc.from('appointments')
    .select('id').eq('agency_id', agencyId).eq('vorstellungsrunde_id', rundeId).in('status', ['booked', 'confirmed']);
  return {
    svc, agencyId, rundeId,
    runde: runde as { id: string; adresse: string; hinweis: string | null; max_teilnehmer: number },
    aktive: ((aktive ?? []) as Array<{ id: string }>).map((a) => a.id),
  };
}

/** PATCH: max. Teilnehmer, Adresse, Hinweis ändern – Adresse/Hinweis gehen auch an gebuchte Termine (Erinnerungen) */
export async function PATCH(request: Request, ctx: Kontext) {
  const k = await ladeKontext(ctx);
  if ('fehler' in k) return k.fehler;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.max_teilnehmer !== undefined) {
    const max = Number(body.max_teilnehmer);
    if (!Number.isInteger(max) || max < 1 || max > 500) return NextResponse.json({ error: 'Max. Teilnehmer muss zwischen 1 und 500 liegen' }, { status: 400 });
    if (max < k.aktive.length) return NextResponse.json({ error: `Es sind bereits ${k.aktive.length} Bewerber gebucht` }, { status: 409 });
    update.max_teilnehmer = max;
  }
  if (body.adresse !== undefined) {
    const adresse = String(body.adresse ?? '').trim().slice(0, 300);
    if (!adresse) return NextResponse.json({ error: 'Bitte die Adresse angeben' }, { status: 400 });
    update.adresse = adresse;
  }
  if (body.hinweis !== undefined) update.hinweis = String(body.hinweis ?? '').trim().slice(0, 200) || null;

  const { error } = await k.svc.from('vorstellungsrunden').update(update).eq('id', k.rundeId).eq('agency_id', k.agencyId);
  if (error) return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 });

  if ((update.adresse !== undefined || update.hinweis !== undefined) && k.aktive.length) {
    const ort = vollstaendigeAdresse(
      (update.adresse as string | undefined) ?? k.runde.adresse,
      update.hinweis !== undefined ? (update.hinweis as string | null) : k.runde.hinweis,
    );
    await k.svc.from('appointments').update({ location: ort, updated_at: new Date().toISOString() })
      .eq('agency_id', k.agencyId).in('id', k.aktive);
  }
  return NextResponse.json({ ok: true });
}

/** DELETE: nur Runden ohne gebuchte Bewerber */
export async function DELETE(_request: Request, ctx: Kontext) {
  const k = await ladeKontext(ctx);
  if ('fehler' in k) return k.fehler;
  if (k.aktive.length) {
    return NextResponse.json({ error: 'In dieser Runde sind noch Bewerber gebucht – bitte erst deren Termine absagen' }, { status: 409 });
  }
  const { error } = await k.svc.from('vorstellungsrunden').delete().eq('id', k.rundeId).eq('agency_id', k.agencyId);
  if (error) return NextResponse.json({ error: 'Runde konnte nicht gelöscht werden' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
