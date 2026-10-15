import { NextRequest, NextResponse } from 'next/server';
import { logActivity } from '@/lib/activity/log';
import { getCurrentUser } from '@/lib/auth';
import { istFreigegeben } from '@/lib/freigaben';
import { normalizePhoneE164 } from '@/lib/phone';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { twilioRestConfig } from '@/lib/twilio/config';
import { bereinigeVorwahl, bundleStatus, istDeutscheNummer, kaufGrund, ortZuVorwahl, vorschlagVorwahl } from '@/lib/twilio/nummer';
import {
  NICHT_EINGERICHTET,
  SCHEMA_FEHLT,
  TwilioFehler,
  adressenLaden,
  bundleLaden,
  bundlesLaden,
  ladeEintrag,
  monatspreis,
  nummerKaufen,
  nummernSchemaBereit,
  nummernSuchen,
  unterkontoAnlegen,
  type Adresse,
  type Bundle,
} from '@/lib/twilio/nummer-server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * WhatsApp-Nummer für einen Kunden besorgen (nur Admins, nur per Klick):
 * GET               → Stand (Unterkonto, Unterlagen, Nummer, letzte Codes); ?nur=codes für das Nachladen alle paar Sekunden
 * POST {aktion}     → suchen (Testlauf, kauft nichts) · unterkonto · kaufen · code_empfang · absender
 * Alles außer „suchen“ braucht die Freigabe whatsapp_nummer_besorgen.
 */

type Ctx = { params: Promise<{ id: string }> };

const CODE_FENSTER_MIN = 15;

function fehler(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

async function nurAdmin() {
  const user = await getCurrentUser();
  return user && user.role === 'admin' ? user : null;
}

async function ladeCodes(svc: SupabaseClient, agencyId: string) {
  const seit = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data } = await svc
    .from('nummer_codes')
    .select('id, art, text, code, created_at')
    .eq('agency_id', agencyId)
    .gte('created_at', seit)
    .order('created_at', { ascending: false })
    .limit(5);
  return data ?? [];
}

async function kundenDaten(svc: SupabaseClient, agencyId: string) {
  const [{ data: a }, { data: o }] = await Promise.all([
    svc.from('agencies').select('id, name, phone, outbound_phone').eq('id', agencyId).maybeSingle(),
    svc.from('onboarding_submissions').select('firmen_plz, firmen_ort').eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const agency = a as { id: string; name: string; phone: string | null; outbound_phone: string | null } | null;
  const onb = o as { firmen_plz: string | null; firmen_ort: string | null } | null;
  return { agency, plz: onb?.firmen_plz ?? null, ort: onb?.firmen_ort ?? null };
}

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!(await nurAdmin())) return fehler('Nur für Admins', 403);
  const { id } = await params;
  if (!isUuid(id)) return fehler('Ungültige Kunden-ID');
  const svc = createAdminClient();
  const schema = await nummernSchemaBereit(svc);

  if (req.nextUrl.searchParams.get('nur') === 'codes') {
    if (!schema) return NextResponse.json({ codes: [], code_empfang_bis: null });
    const [codes, eintrag] = await Promise.all([ladeCodes(svc, id), ladeEintrag(svc, id)]);
    return NextResponse.json({ codes, code_empfang_bis: eintrag?.code_empfang_bis ?? null });
  }

  const { agency, plz, ort } = await kundenDaten(svc, id);
  if (!agency) return fehler('Kunde nicht gefunden', 404);
  const twilio = !!twilioRestConfig();
  const freigabe = await istFreigegeben(svc, 'whatsapp_nummer_besorgen');
  const eintrag = schema ? await ladeEintrag(svc, id) : null;

  let bundles: Array<Bundle & { anzeige: ReturnType<typeof bundleStatus> }> = [];
  let adressen: Adresse[] = [];
  let twilioFehler: string | null = null;
  if (twilio && eintrag?.twilio_subaccount_sid) {
    try {
      const [b, ad] = await Promise.all([bundlesLaden(eintrag.twilio_subaccount_sid), adressenLaden(eintrag.twilio_subaccount_sid)]);
      bundles = b.map((x) => ({ ...x, anzeige: bundleStatus(x.status) }));
      adressen = ad;
    } catch (e) {
      twilioFehler = e instanceof TwilioFehler ? e.message : 'Twilio-Abfrage fehlgeschlagen';
    }
  }

  return NextResponse.json({
    twilio,
    schema,
    freigabe,
    kunde: { name: agency.name, outbound_phone: agency.outbound_phone, plz, ort },
    vorschlag: vorschlagVorwahl({ telefone: [agency.phone, agency.outbound_phone], plz }),
    eintrag,
    bundles,
    adressen,
    twilioFehler,
    codes: schema ? await ladeCodes(svc, id) : [],
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await nurAdmin();
  if (!user) return fehler('Nur für Admins', 403);
  const { id } = await params;
  if (!isUuid(id)) return fehler('Ungültige Kunden-ID');
  const body = (await req.json().catch(() => ({}))) as {
    aktion?: string;
    vorwahl?: string;
    nummer?: string;
    bundle_sid?: string;
    address_sid?: string;
    sms?: boolean;
    bestaetigt?: boolean;
  };
  const svc = createAdminClient();
  if (!twilioRestConfig()) return fehler(NICHT_EINGERICHTET, 503);

  try {
    // Testlauf: nur suchen, kauft nichts – auch ohne Freigabe und ohne Datenbank-Änderung
    if (body.aktion === 'suchen') {
      const vorwahl = bereinigeVorwahl(body.vorwahl);
      if (!vorwahl) return fehler('Bitte eine gültige deutsche Ortsvorwahl angeben, z. B. 030');
      const eintrag = (await nummernSchemaBereit(svc)) ? await ladeEintrag(svc, id) : null;
      const [nummern, preis] = await Promise.all([nummernSuchen(vorwahl, eintrag?.twilio_subaccount_sid), monatspreis()]);
      return NextResponse.json({ vorwahl, ort: ortZuVorwahl(vorwahl), nummern, preis });
    }

    if (!(await nummernSchemaBereit(svc))) return fehler(SCHEMA_FEHLT, 503);
    if (!(await istFreigegeben(svc, 'whatsapp_nummer_besorgen'))) return fehler('„WhatsApp-Nummer besorgen“ ist noch nicht freigegeben – unter Freigaben einschalten', 403);
    const { agency } = await kundenDaten(svc, id);
    if (!agency) return fehler('Kunde nicht gefunden', 404);
    const eintrag = await ladeEintrag(svc, id);

    if (body.aktion === 'unterkonto') {
      if (eintrag?.twilio_subaccount_sid) return NextResponse.json({ ok: true, eintrag });
      const sid = await unterkontoAnlegen(agency.name);
      const { data, error } = await svc
        .from('kunden_telefonnummern')
        .upsert({ agency_id: id, twilio_subaccount_sid: sid, status: 'unterkonto', angelegt_von: user.id, updated_at: new Date().toISOString() }, { onConflict: 'agency_id' })
        .select('*')
        .single();
      if (error) return fehler(`Unterkonto ${sid} wurde bei Twilio angelegt, aber nicht gespeichert: ${error.message}`, 500);
      await logActivity(svc, { agency_id: id, user_id: user.id, action: 'Twilio-Unterkonto für die WhatsApp-Nummer angelegt', action_type: 'other', metadata: { kind: 'whatsapp_nummer', schritt: 'unterkonto', subaccount_sid: sid } });
      return NextResponse.json({ ok: true, eintrag: data });
    }

    if (body.aktion === 'kaufen') {
      if (!istDeutscheNummer(body.nummer)) return fehler('Ungültige Nummer');
      const sub = eintrag?.twilio_subaccount_sid ?? null;
      // Unterlagen + Adresse frisch bei Twilio prüfen – nie dem Browser glauben
      const bundle = sub && body.bundle_sid ? await bundleLaden(sub, body.bundle_sid).catch(() => null) : null;
      const adressen = sub ? await adressenLaden(sub) : [];
      const adresse = adressen.find((a) => a.sid === body.address_sid) ?? null;
      const grund = kaufGrund({
        twilioBereit: true,
        schemaBereit: true,
        freigegeben: true,
        unterkonto: !!sub,
        schonGekauft: !!eintrag?.phone_number_sid,
        bundle: bundle?.status,
        adresse: !!adresse,
        bestaetigt: body.bestaetigt === true,
      });
      if (grund || !sub || !bundle || !adresse) return fehler(grund ?? 'Kauf nicht möglich');

      const gekauft = await nummerKaufen({ subSid: sub, nummer: body.nummer, bundleSid: bundle.sid, addressSid: adresse.sid, sms: body.sms === true, name: agency.name });
      const { data, error } = await svc
        .from('kunden_telefonnummern')
        .update({
          phone_number_sid: gekauft.sid,
          nummer_e164: gekauft.nummer,
          bundle_sid: bundle.sid,
          address_sid: adresse.sid,
          status: 'gekauft',
          gekauft_von: user.id,
          gekauft_am: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('agency_id', id)
        .select('*')
        .single();
      await logActivity(svc, { agency_id: id, user_id: user.id, action: `Nummer ${gekauft.nummer} für WhatsApp gekauft`, action_type: 'other', metadata: { kind: 'whatsapp_nummer', schritt: 'kauf', nummer: gekauft.nummer, phone_number_sid: gekauft.sid } });
      if (error) return fehler(`Nummer ${gekauft.nummer} (${gekauft.sid}) wurde gekauft, aber nicht gespeichert: ${error.message}`, 500);
      return NextResponse.json({ ok: true, eintrag: data });
    }

    if (body.aktion === 'code_empfang') {
      if (!eintrag?.nummer_e164) return fehler('Noch keine Nummer gekauft');
      const bis = new Date(Date.now() + CODE_FENSTER_MIN * 60_000).toISOString();
      const { error } = await svc.from('kunden_telefonnummern').update({ code_empfang_bis: bis, updated_at: new Date().toISOString() }).eq('agency_id', id);
      if (error) return fehler(error.message, 500);
      return NextResponse.json({ ok: true, code_empfang_bis: bis });
    }

    if (body.aktion === 'absender') {
      const nummer = normalizePhoneE164(eintrag?.nummer_e164);
      if (!nummer) return fehler('Noch keine Nummer gekauft');
      const { error } = await svc.from('agencies').update({ outbound_phone: nummer }).eq('id', id);
      if (error) return fehler(error.message, 500);
      await logActivity(svc, { agency_id: id, user_id: user.id, action: `Absendernummer auf ${nummer} gesetzt`, action_type: 'other', metadata: { kind: 'whatsapp_nummer', schritt: 'absender', nummer, vorher: agency.outbound_phone } });
      return NextResponse.json({ ok: true, outbound_phone: nummer });
    }

    return fehler('Unbekannte Aktion');
  } catch (e) {
    if (e instanceof TwilioFehler) return fehler(e.message, 502);
    console.error('[whatsapp-nummer]', e instanceof Error ? e.message : 'Fehler');
    return fehler('Unerwarteter Fehler', 500);
  }
}
