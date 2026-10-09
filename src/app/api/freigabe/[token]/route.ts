import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, clientIp } from '@/lib/security/rate-limit';
import { zeitText } from '@/lib/videos/konstanten';
import { ladeFreigabe, ladeLink, meldeKundenAktion } from '@/lib/videos/freigabe';

/** Öffentlich (ohne Login) – Kunden-Freigabe über den Link-Token */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await ladeFreigabe(createAdminClient(), token);
  if (!d) return NextResponse.json({ error: 'Link ungültig oder abgelaufen' }, { status: 404 });
  return NextResponse.json(d);
}

type Body =
  | { aktion: 'kommentar'; name?: string; text?: string; zeit_s?: number | null; zeit_bis_s?: number | null; version_id?: string }
  | { aktion: 'entscheidung'; name?: string; entscheidung?: 'freigegeben' | 'aenderungen'; text?: string; version_id?: string };

/** POST – Kommentar oder Entscheidung des Kunden */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const svc = createAdminClient();
  if (!(await checkRateLimit(svc, `freigabe:${token}:${clientIp(req.headers)}`, 40, 600))) {
    return NextResponse.json({ error: 'Zu viele Anfragen – bitte kurz warten' }, { status: 429 });
  }
  const link = await ladeLink(svc, token);
  if (!link) return NextResponse.json({ error: 'Link ungültig oder abgelaufen' }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const name = (b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: 'Bitte deinen Namen angeben' }, { status: 400 });

  const { data: v } = await svc.from('videos').select('id, titel, aktuelle_version').eq('id', link.video_id).single();
  const video = v as { id: string; titel: string; aktuelle_version: number };
  const { data: ver } = await svc.from('video_versionen').select('id').eq('video_id', video.id).eq('version', video.aktuelle_version).single();
  const versionId = (ver as { id: string }).id;
  // Seite zeigt eine ältere Version (inzwischen neue hochgeladen) → neu laden lassen
  if (b.version_id && b.version_id !== versionId) return NextResponse.json({ error: 'Es gibt inzwischen eine neue Version – bitte die Seite neu laden', neu_laden: true }, { status: 409 });

  if (b.aktion === 'kommentar') {
    const text = (b.text ?? '').trim();
    if (!text) return NextResponse.json({ error: 'Kommentar ist leer' }, { status: 400 });
    const { count } = await svc.from('video_kommentare').select('id', { count: 'exact', head: true }).eq('video_id', video.id).eq('extern', true);
    if ((count ?? 0) >= 300) return NextResponse.json({ error: 'Maximale Anzahl Kommentare erreicht' }, { status: 400 });
    const zeitS = typeof b.zeit_s === 'number' && Number.isFinite(b.zeit_s) && b.zeit_s >= 0 ? Math.round(b.zeit_s * 10) / 10 : null;
    const bis = typeof b.zeit_bis_s === 'number' && Number.isFinite(b.zeit_bis_s) ? Math.round(b.zeit_bis_s * 10) / 10 : null;
    // Vor dem Einfügen: gab es in den letzten 10 Minuten schon einen Kundenkommentar? (dann keine zweite Benachrichtigung)
    const { count: kuerzlich } = await svc
      .from('video_kommentare')
      .select('id', { count: 'exact', head: true })
      .eq('video_id', video.id)
      .eq('extern', true)
      .gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString());
    const { data, error } = await svc
      .from('video_kommentare')
      .insert({
        video_id: video.id,
        version_id: versionId,
        zeit_s: zeitS,
        zeit_bis_s: zeitS !== null && bis !== null && bis > zeitS ? bis : null,
        text: text.slice(0, 3000),
        autor_id: null,
        extern: true,
        kunde_name: name,
      })
      .select('id, zeit_s, zeit_bis_s, text, kunde_name, erledigt, created_at')
      .single();
    if (error) return NextResponse.json({ error: 'Kommentar konnte nicht gespeichert werden' }, { status: 500 });
    if (!kuerzlich) await meldeKundenAktion(svc, video.id, `💬 Kunde kommentiert: ${video.titel}`, `${name}${zeitS !== null ? ` bei ${zeitText(zeitS)}` : ''}: ${text.slice(0, 120)}`);
    return NextResponse.json(data);
  }

  if (b.aktion === 'entscheidung' && (b.entscheidung === 'freigegeben' || b.entscheidung === 'aenderungen')) {
    const jetzt = new Date().toISOString();
    const patch: Record<string, unknown> = { kunden_status: b.entscheidung, kunden_entscheidung_am: jetzt, updated_at: jetzt };
    // Änderungswunsch des Kunden landet direkt wieder beim Bearbeiter
    if (b.entscheidung === 'aenderungen') {
      patch.status = 'aenderungen';
      patch.freigegeben_am = null;
    }
    const { error } = await svc.from('videos').update(patch).eq('id', video.id);
    if (error) return NextResponse.json({ error: 'Entscheidung konnte nicht gespeichert werden' }, { status: 500 });
    const notiz = (b.text ?? '').trim();
    if (notiz) {
      await svc.from('video_kommentare').insert({ video_id: video.id, version_id: versionId, zeit_s: null, text: notiz.slice(0, 3000), autor_id: null, extern: true, kunde_name: name });
    }
    await meldeKundenAktion(
      svc,
      video.id,
      b.entscheidung === 'freigegeben' ? `🎉 Kunde hat freigegeben: ${video.titel}` : `✏️ Kunde wünscht Änderungen: ${video.titel}`,
      `${name} – Version ${video.aktuelle_version}${notiz ? `: ${notiz.slice(0, 120)}` : ''}`,
    );
    return NextResponse.json({ ok: true, kunden_status: b.entscheidung });
  }
  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
}
