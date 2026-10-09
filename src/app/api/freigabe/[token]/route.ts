import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, clientIp } from '@/lib/security/rate-limit';
import { zeitText } from '@/lib/videos/konstanten';
import { ladeFreigabe, ladeLink, meldeKundenAktion } from '@/lib/videos/freigabe';

const MAX_EXTERN = 300;

/** Öffentlich (ohne Login) – Kunden-Freigabe über den Link-Token */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const svc = createAdminClient();
  if (!(await checkRateLimit(svc, `freigabe-lesen:${clientIp(req.headers)}`, 120, 600))) {
    return NextResponse.json({ error: 'Zu viele Anfragen – bitte kurz warten' }, { status: 429 });
  }
  const d = await ladeFreigabe(svc, token);
  if (!d) return NextResponse.json({ error: 'Link ungültig oder abgelaufen' }, { status: 404 });
  return NextResponse.json(d);
}

type Body =
  | { aktion: 'kommentar'; name?: string; text?: string; zeit_s?: number | null; zeit_bis_s?: number | null; version_id?: string }
  | { aktion: 'entscheidung'; name?: string; entscheidung?: 'freigegeben' | 'aenderungen'; text?: string; version_id?: string };

/** POST – Kommentar oder Entscheidung des Kunden (immer zur Version, die der Kunde gerade sieht) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const svc = createAdminClient();
  const ip = clientIp(req.headers);
  if (!(await checkRateLimit(svc, `freigabe:${token}:${ip}`, 40, 600)) || !(await checkRateLimit(svc, `freigabe-token:${token}`, 150, 3600))) {
    return NextResponse.json({ error: 'Zu viele Anfragen – bitte kurz warten' }, { status: 429 });
  }
  const link = await ladeLink(svc, token);
  if (!link) return NextResponse.json({ error: 'Link ungültig oder abgelaufen' }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const name = (b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: 'Bitte deinen Namen angeben' }, { status: 400 });

  const { data: v } = await svc.from('videos').select('id, titel, aktuelle_version, kunden_version, kunden_status').eq('id', link.video_id).maybeSingle();
  const video = v as { id: string; titel: string; aktuelle_version: number; kunden_version: number | null; kunden_status: string | null } | null;
  if (!video) return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  const nr = video.kunden_version ?? video.aktuelle_version;
  const { data: ver } = await svc.from('video_versionen').select('id').eq('video_id', video.id).eq('version', nr).maybeSingle();
  const versionId = (ver as { id: string } | null)?.id;
  if (!versionId) return NextResponse.json({ error: 'Version nicht gefunden' }, { status: 404 });
  // Seite zeigt eine andere Version, als der Kunde inzwischen bekommen hat → neu laden lassen
  if (!b.version_id || b.version_id !== versionId) return NextResponse.json({ error: 'Es gibt inzwischen eine neue Version – bitte die Seite neu laden', neu_laden: true }, { status: 409 });

  const text = (b.text ?? '').trim();
  const { count: externGesamt } = await svc.from('video_kommentare').select('id', { count: 'exact', head: true }).eq('video_id', video.id).eq('extern', true);
  const limitErreicht = (externGesamt ?? 0) >= MAX_EXTERN;

  if (b.aktion === 'kommentar') {
    if (!text) return NextResponse.json({ error: 'Kommentar ist leer' }, { status: 400 });
    if (limitErreicht) return NextResponse.json({ error: 'Maximale Anzahl Kommentare erreicht' }, { status: 400 });
    const zeitS = typeof b.zeit_s === 'number' && Number.isFinite(b.zeit_s) && b.zeit_s >= 0 ? Math.round(b.zeit_s * 100) / 100 : null;
    const bis = typeof b.zeit_bis_s === 'number' && Number.isFinite(b.zeit_bis_s) ? Math.round(b.zeit_bis_s * 100) / 100 : null;
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
    // Änderungswunsch landet beim Bearbeiter – aber nur, wenn intern nicht schon eine neuere Version in Arbeit ist
    if (b.entscheidung === 'aenderungen' && nr === video.aktuelle_version) {
      patch.status = 'aenderungen';
      patch.freigegeben_am = null;
    }
    // Atomar: nur einmal je Version entscheiden (Status muss noch „offen“ sein und die Version passen)
    const { data: geaendert, error } = await svc
      .from('videos')
      .update(patch)
      .eq('id', video.id)
      .eq('kunden_status', 'offen')
      .eq('kunden_version', nr)
      .select('id');
    if (error) return NextResponse.json({ error: 'Entscheidung konnte nicht gespeichert werden' }, { status: 500 });
    if (!geaendert?.length) return NextResponse.json({ error: 'Für diese Version wurde bereits entschieden', neu_laden: true }, { status: 409 });
    if (text && !limitErreicht) {
      const { error: nErr } = await svc.from('video_kommentare').insert({ video_id: video.id, version_id: versionId, zeit_s: null, text: text.slice(0, 3000), autor_id: null, extern: true, kunde_name: name });
      if (nErr) console.error('[freigabe] Notiz nicht gespeichert', nErr.message);
    }
    await meldeKundenAktion(
      svc,
      video.id,
      b.entscheidung === 'freigegeben' ? `🎉 Kunde hat freigegeben: ${video.titel}` : `✏️ Kunde wünscht Änderungen: ${video.titel}`,
      `${name} – Version ${nr}${text ? `: ${text.slice(0, 120)}` : ''}`,
    );
    return NextResponse.json({ ok: true, kunden_status: b.entscheidung });
  }
  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
}
