import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { meldeVideo } from '@/lib/videos/ablauf';
import { VIDEO_ARTEN, VIDEO_BUCKET, VIDEO_STATUS } from '@/lib/videos/konstanten';

/** GET – Video mit allen Versionen (signierte Abspiel-URLs, 4 h) und Kommentaren */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const svc = createAdminClient();
  const [{ data: video }, { data: versionen }, { data: kommentare }, { data: team }, { data: agencies }] = await Promise.all([
    svc.from('videos').select('*, agencies(name)').eq('id', id).maybeSingle(),
    svc.from('video_versionen').select('*').eq('video_id', id).order('version', { ascending: false }),
    svc.from('video_kommentare').select('*').eq('video_id', id).order('zeit_s', { ascending: true, nullsFirst: true }).order('created_at'),
    svc.from('users').select('id, name, avatar_url').in('role', ['admin', 'employee']),
    svc.from('agencies').select('id, name').order('name'),
  ]);
  const { data: link } = await svc.from('video_freigabe_links').select('token').eq('video_id', id).eq('aktiv', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { freigabeUrl } = await import('@/lib/videos/freigabe');
  if (!video) return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  const mitUrl = await Promise.all(
    ((versionen ?? []) as Array<{ storage_pfad: string } & Record<string, unknown>>).map(async (v) => {
      const { data } = await svc.storage.from(VIDEO_BUCKET).createSignedUrl(v.storage_pfad, 4 * 3600);
      return { ...v, url: data?.signedUrl ?? null };
    }),
  );
  return NextResponse.json({
    ich: { id: user.id, role: user.role, name: user.name },
    video,
    versionen: mitUrl,
    kommentare: kommentare ?? [],
    team: team ?? [],
    agencies: agencies ?? [],
    kundenLink: link ? freigabeUrl((link as { token: string }).token) : null,
  });
}

/** PATCH { status?, titel?, agency_id?, art?, bearbeiter_id?, pruefer_id?, faellig_am? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const svc = createAdminClient();
  const { data: alt } = await svc.from('videos').select('id, titel, status, bearbeiter_id, pruefer_id, aktuelle_version').eq('id', id).maybeSingle();
  if (!alt) return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  const v = alt as { id: string; titel: string; status: string; bearbeiter_id: string | null; pruefer_id: string | null; aktuelle_version: number };
  const istPruefer = user.role === 'admin' || v.pruefer_id === user.id;
  // Freigeben / Änderungen anfordern nur durch den Prüfer oder einen Admin
  if ((b.status === 'freigegeben' || b.status === 'aenderungen') && !istPruefer) {
    return NextResponse.json({ error: 'Nur der Prüfer oder ein Admin kann freigeben bzw. Änderungen anfordern' }, { status: 403 });
  }
  // Prüfer umsetzen ebenfalls nur Prüfer/Admin – sonst könnte man sich selbst eintragen und freigeben
  if ('pruefer_id' in b && (b.pruefer_id ?? null) !== v.pruefer_id && !istPruefer) {
    return NextResponse.json({ error: 'Nur der Prüfer oder ein Admin kann den Prüfer ändern' }, { status: 403 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.titel === 'string' && b.titel.trim()) patch.titel = b.titel.trim().slice(0, 160);
  if ('agency_id' in b) patch.agency_id = typeof b.agency_id === 'string' && b.agency_id ? b.agency_id : null;
  if (typeof b.art === 'string' && b.art in VIDEO_ARTEN) patch.art = b.art;
  if ('bearbeiter_id' in b) patch.bearbeiter_id = typeof b.bearbeiter_id === 'string' && b.bearbeiter_id ? b.bearbeiter_id : null;
  if ('pruefer_id' in b) patch.pruefer_id = typeof b.pruefer_id === 'string' && b.pruefer_id ? b.pruefer_id : null;
  if ('faellig_am' in b) patch.faellig_am = typeof b.faellig_am === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.faellig_am) ? b.faellig_am : null;
  if (typeof b.status === 'string' && b.status in VIDEO_STATUS) {
    patch.status = b.status;
    patch.freigegeben_am = b.status === 'freigegeben' ? new Date().toISOString() : null;
  }
  const { data, error } = await svc.from('videos').update(patch).eq('id', id).select('*, agencies(name)').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (patch.status && patch.status !== v.status) {
    const bearbeiter = (patch.bearbeiter_id as string | null | undefined) ?? v.bearbeiter_id;
    if (patch.status === 'freigegeben') {
      await meldeVideo(svc, bearbeiter, user.id, id, `✅ Freigegeben: ${v.titel}`, `Version ${v.aktuelle_version} ist freigegeben.`);
    } else if (patch.status === 'aenderungen') {
      const { count } = await svc.from('video_kommentare').select('id', { count: 'exact', head: true }).eq('video_id', id).eq('erledigt', false);
      await meldeVideo(svc, bearbeiter, user.id, id, `✏️ Änderungen: ${v.titel}`, `${count ?? 0} offene Kommentare in Version ${v.aktuelle_version}.`);
    }
  }
  return NextResponse.json(data);
}

/** DELETE – Video samt aller Versionen und Dateien (nur Admin oder wer es angelegt hat) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const svc = createAdminClient();
  const { data: video } = await svc.from('videos').select('created_by').eq('id', id).maybeSingle();
  if (!video) return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  if (user.role !== 'admin' && (video as { created_by: string | null }).created_by !== user.id) {
    return NextResponse.json({ error: 'Nur Admins oder wer das Video angelegt hat, können es löschen' }, { status: 403 });
  }
  const { data: versionen } = await svc.from('video_versionen').select('storage_pfad').eq('video_id', id);
  const pfade = ((versionen ?? []) as Array<{ storage_pfad: string }>).map((v) => v.storage_pfad);
  // Erst die Datenbank, dann die Dateien – scheitert das Löschen in der DB, bleiben die Dateien erhalten
  const { error } = await svc.from('videos').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (pfade.length) {
    const { error: sErr } = await svc.storage.from(VIDEO_BUCKET).remove(pfade);
    if (sErr) console.error('[videos] Dateien nicht gelöscht', id, sErr.message);
  }
  return NextResponse.json({ ok: true });
}
