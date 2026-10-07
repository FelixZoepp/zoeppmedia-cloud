import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ERINNERUNG_AKTIV_KEY, erinnereKunden, erinnerungenAktiv } from '@/lib/fulfillment/kunden-erinnerung';
import { verknuepfeKundenKontakte } from '@/lib/fulfillment/kunden-kontakt';

export const maxDuration = 300;

async function syncToken(req: NextRequest, svc: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const token = req.headers.get('x-sync-token');
  if (!token) return false;
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', 'sync_token').maybeSingle();
  return (data as { wert: string } | null)?.wert === token;
}

/** GET – Schalter, Freigabe der WhatsApp-Vorlage und wer heute erinnert würde (intern) */
export async function GET(req: NextRequest) {
  const svc = createAdminClient();
  const user = await getCurrentUser();
  if (!(await syncToken(req, svc)) && (!user || !isInternal(user.role))) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const [aktiv, faellig, { data: vorlage }] = await Promise.all([
    erinnerungenAktiv(svc),
    erinnereKunden(svc, { trocken: true }),
    svc.from('whatsapp_templates').select('status').eq('preset_key', 'kunde_aufgaben_erinnerung').maybeSingle(),
  ]);
  return NextResponse.json({ aktiv, darfSchalten: user?.role === 'admin', vorlage: (vorlage as { status: string } | null)?.status ?? 'nicht_eingereicht', faellig });
}

/** POST { aktiv } – Automatik an/aus · { aktion: 'kontakte' } – Nummern (auch aus Close) holen und Kunden im WhatsApp markieren */
export async function POST(req: NextRequest) {
  const svc = createAdminClient();
  const user = await getCurrentUser();
  if (!(await syncToken(req, svc)) && user?.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { aktiv?: boolean; aktion?: string };
  if (body.aktion === 'kontakte') return NextResponse.json({ kunden: await verknuepfeKundenKontakte(svc, { mitClose: true }) });
  const { error } = await svc.from('system_einstellungen').upsert({ key: ERINNERUNG_AKTIV_KEY, wert: body.aktiv ? 'true' : 'false' }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ aktiv: !!body.aktiv });
}
