import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ERINNERUNG_AKTIV_KEY, erinnereKunden, erinnerungenAktiv } from '@/lib/fulfillment/kunden-erinnerung';
import { kundenKontakt, verknuepfeKundenKontakte } from '@/lib/fulfillment/kunden-kontakt';
import { normalizeToE164 } from '@/lib/sales/calendly-chain';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';

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
  const [aktiv, faellig, { data: vorlage }, { data: ags }] = await Promise.all([
    erinnerungenAktiv(svc),
    erinnereKunden(svc, { trocken: true }),
    svc.from('whatsapp_templates').select('status').eq('preset_key', 'kunde_aufgaben_erinnerung').maybeSingle(),
    svc.from('agencies').select('id, name, contact_name, phone').not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`).not('fulfillment_phase', 'in', '(beendet,offboarding)').order('name'),
  ]);
  const ohneNummer = ((ags ?? []) as Array<{ id: string; name: string; contact_name: string | null; phone: string | null }>)
    .filter((a) => !normalizeToE164(a.phone))
    .map((a) => ({ id: a.id, name: a.name, kontakt: a.contact_name }));
  return NextResponse.json({ aktiv, darfSchalten: user?.role === 'admin', vorlage: (vorlage as { status: string } | null)?.status ?? 'nicht_eingereicht', faellig, ohneNummer });
}

/** POST { aktiv } – Automatik an/aus · { aktion: 'kontakte' } – Nummern (auch aus Close) holen und Kunden im WhatsApp markieren */
export async function POST(req: NextRequest) {
  const svc = createAdminClient();
  const user = await getCurrentUser();
  if (!(await syncToken(req, svc)) && user?.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { aktiv?: boolean; aktion?: string; agency_id?: string; nummer?: string };
  if (body.aktion === 'kontakte') return NextResponse.json({ kunden: await verknuepfeKundenKontakte(svc, { mitClose: true }) });
  if (body.aktion === 'nummer') {
    const nummer = normalizeToE164(body.nummer);
    if (!body.agency_id || !nummer) return NextResponse.json({ error: 'Bitte eine gültige Handynummer eingeben' }, { status: 400 });
    const { data: a } = await svc.from('agencies').update({ phone: nummer }).eq('id', body.agency_id).select('id, name, email, phone, contact_name').maybeSingle();
    if (!a) return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
    await kundenKontakt(svc, a as { id: string; name: string; email: string | null; phone: string | null; contact_name: string | null }, nummer);
    return NextResponse.json({ nummer });
  }
  const { error } = await svc.from('system_einstellungen').upsert({ key: ERINNERUNG_AKTIV_KEY, wert: body.aktiv ? 'true' : 'false' }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ aktiv: !!body.aktiv });
}
