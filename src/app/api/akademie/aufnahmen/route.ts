import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import {
  AUFNAHME_BUCKET,
  darfAufnehmen,
  erlaubteNutzer,
  legeAufnahmeAn,
  pruefeAnlage,
  type AnlageEingabe,
} from '@/lib/akademie/aufnahme';

/** GET – Aufnahmen-Übersicht (nur Admin) */
export async function GET() {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const [{ data }, erlaubt, { data: team }] = await Promise.all([
    k.svc
      .from('akademie_aufnahmen')
      .select('id, erstellt_von, modus, titel, kontext, dauer_sek, status, fehler, artikel_slug, video_key, offene_fragen, versuche, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(50),
    erlaubteNutzer(k.svc),
    k.svc.from('users').select('id, name, role, funktion').in('role', ['admin', 'employee']),
  ]);
  return NextResponse.json({ aufnahmen: data ?? [], erlaubt, team: team ?? [] });
}

/**
 * POST – Aufnahme anlegen und signierte Upload-URLs ausgeben. Der Browser lädt Audio-Teile, Standbilder
 * und ggf. das Video direkt in den privaten Bucket – nichts davon läuft durch diese Funktion.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return fehler('Nicht angemeldet', 401);
  const svc = createAdminClient();
  if (!(await darfAufnehmen(svc, user))) return fehler('Aufnehmen ist nur für Admins bzw. freigeschaltete Mitarbeiter', 403);

  const body = (await req.json().catch(() => null)) as Partial<AnlageEingabe> | null;
  if (!body) return fehler('JSON erwartet');
  const eingabe: AnlageEingabe = {
    modus: body.modus as AnlageEingabe['modus'],
    titel: String(body.titel ?? ''),
    hinweis: body.hinweis ?? null,
    kontext: typeof body.kontext === 'object' && body.kontext ? body.kontext : {},
    audioTeile: Number(body.audioTeile),
    bilder: Number(body.bilder ?? 0),
    video: body.video && typeof body.video === 'object' ? { mime: String(body.video.mime ?? ''), bytes: Number(body.video.bytes ?? 0) } : null,
    audioMime: typeof body.audioMime === 'string' ? body.audioMime : null,
    dauerSek: body.dauerSek == null ? null : Number(body.dauerSek),
    groesseBytes: body.groesseBytes == null ? null : Number(body.groesseBytes),
  };
  const ungueltig = pruefeAnlage(eingabe);
  if (ungueltig) return fehler(ungueltig);

  try {
    const { id, pfade } = await legeAufnahmeAn(svc, eingabe, user.id);
    const uploads = [];
    for (const p of pfade) {
      const { data, error } = await svc.storage.from(AUFNAHME_BUCKET).createSignedUploadUrl(p.pfad);
      if (error || !data) throw new Error(`Upload-Link fehlgeschlagen: ${error?.message ?? 'unbekannt'}`);
      uploads.push({ ...p, signedUrl: data.signedUrl });
    }
    return NextResponse.json({ id, uploads });
  } catch (err) {
    return fehler(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen', 500);
  }
}
