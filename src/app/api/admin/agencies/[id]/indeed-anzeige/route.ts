import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { moveAd } from '@/lib/ads/ads';
import { setStepStatus } from '@/lib/fulfillment/engine';
import { speichereIndeedAnzeige } from '@/lib/indeed/speichern';
import { darfZumKunden, freigabeStatus, kiFehlertext, pruefeAd, versionsKey, type KiPruefung } from '@/lib/ads/ki-pruefung';
import {
  IndeedAnzeigeSchema,
  anzeigeAlsText,
  fehlendeAngaben,
  generiereIndeedAnzeige,
  ladeBriefing,
  type IndeedAnzeige,
} from '@/lib/indeed/anzeige';

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };
type Karte = { id: string; stage: string; inhalt: IndeedAnzeige | null; kunden_kommentar: string | null; updated_at: string; ki_pruefung: KiPruefung | null };

async function aktuelleKarte(svc: ReturnType<typeof createAdminClient>, agencyId: string): Promise<Karte | null> {
  const { data } = await svc
    .from('ad_items')
    .select('id, stage, inhalt, kunden_kommentar, updated_at, ki_pruefung')
    .eq('agency_id', agencyId)
    .eq('typ', 'indeed')
    .neq('stage', 'verworfen')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Karte | null) ?? null;
}

/** GET – Briefing-Stand + aktuelle Indeed-Anzeige des Kunden */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const svc = createAdminClient();
  const briefing = await ladeBriefing(svc, id);
  if (!briefing) return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
  return NextResponse.json({ briefing, fehlend: fehlendeAngaben(briefing), anzeige: await aktuelleKarte(svc, id) });
}

/** POST { zusatz?, feedback? } – Anzeige mit 1 Klick generieren bzw. nach Feedback überarbeiten */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { zusatz?: string; feedback?: string };
  const zusatz = body.zusatz?.slice(0, 8000) ?? null;
  const feedback = body.feedback?.slice(0, 4000) ?? null;

  const svc = createAdminClient();
  const briefing = await ladeBriefing(svc, id);
  if (!briefing) return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
  if (!briefing.jobtitel && !zusatz?.trim()) {
    return NextResponse.json({ error: 'Es fehlt die Stellenbezeichnung – Onboarding-Formular ausfüllen lassen oder Infos aus dem Gespräch eintragen.' }, { status: 400 });
  }

  const karte = await aktuelleKarte(svc, id);
  let anzeige: IndeedAnzeige;
  try {
    anzeige = await generiereIndeedAnzeige(briefing, { zusatz, vorher: karte?.inhalt ?? null, feedback });
  } catch (err) {
    console.error('[indeed-anzeige] Generierung fehlgeschlagen:', err);
    const msg = err instanceof Error ? err.message : '';
    return NextResponse.json(
      { error: /401|authentication|api.key/i.test(msg) ? 'Der KI-Schlüssel (ANTHROPIC_API_KEY) ist ungültig – bitte in Vercel erneuern.' : msg || 'Generierung fehlgeschlagen' },
      { status: 502 },
    );
  }

  try {
    await speichereIndeedAnzeige(svc, id, anzeige, user.id);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Speichern fehlgeschlagen' }, { status: 500 });
  }
  return NextResponse.json({ anzeige: await aktuelleKarte(svc, id) });
}

/** PUT { inhalt?, aktion?: 'zur_freigabe' } – Änderungen speichern und/oder an den Kunden zur Freigabe schicken */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { inhalt?: unknown; aktion?: string; ki_override_grund?: string };
  const svc = createAdminClient();
  const karte = await aktuelleKarte(svc, id);
  if (!karte) return NextResponse.json({ error: 'Noch keine Indeed-Anzeige vorhanden' }, { status: 404 });

  if (body.inhalt !== undefined) {
    const p = IndeedAnzeigeSchema.safeParse(body.inhalt);
    if (!p.success) return NextResponse.json({ error: 'Titel, Arbeitsort, Anstellungsart und Text müssen ausgefüllt sein' }, { status: 400 });
    if (!p.data.titel.trim() || !p.data.text.trim()) return NextResponse.json({ error: 'Titel und Text dürfen nicht leer sein' }, { status: 400 });
    await svc
      .from('ad_items')
      .update({ titel: `Indeed: ${p.data.titel}`, idee: anzeigeAlsText(p.data), inhalt: p.data, updated_at: new Date().toISOString() })
      .eq('id', karte.id);
  }

  if (body.aktion === 'zur_freigabe') {
    if (['freigabe_kunde', 'bereit', 'live'].includes(karte.stage)) {
      return NextResponse.json({ error: 'Die Anzeige liegt schon beim Kunden bzw. ist freigegeben' }, { status: 409 });
    }
    // Doppelter Boden: KI-Prüfung der aktuellen Fassung (läuft automatisch, falls noch keine da ist)
    const grund = body.ki_override_grund?.trim() ?? '';
    const { data: cur } = await svc.from('ad_items').select('*').eq('id', karte.id).maybeSingle();
    if (grund) {
      if (grund.length < 10) return NextResponse.json({ error: 'Bitte kurz begründen (mind. 10 Zeichen)' }, { status: 400 });
      await svc.from('ad_items').update({ ki_override: { grund, user_id: user.id, am: new Date().toISOString(), fuer: versionsKey(cur as never) } }).eq('id', karte.id);
    } else {
      let status = freigabeStatus(cur as never);
      if (status === 'fehlt') {
        try {
          await pruefeAd(svc, karte.id);
          const { data: neu } = await svc.from('ad_items').select('*').eq('id', karte.id).maybeSingle();
          status = freigabeStatus(neu as never);
        } catch (err) {
          return NextResponse.json({ error: kiFehlertext(err), code: 'ki_pruefung', anzeige: await aktuelleKarte(svc, id) }, { status: 409 });
        }
      }
      if (!darfZumKunden(status)) {
        return NextResponse.json(
          { error: 'Die KI-Prüfung ist rot – bitte die Punkte unten verbessern oder begründet übersteuern.', code: 'ki_pruefung', anzeige: await aktuelleKarte(svc, id) },
          { status: 409 },
        );
      }
    }
    await moveAd(svc, karte.id, 'freigabe_kunde', { userId: user.id });
    // Fulfillment: „Indeed-Anzeige erstellt“ abhaken
    const { data: schritt } = await svc
      .from('client_steps')
      .select('id')
      .eq('agency_id', id)
      .eq('step_key', 's_indeed_anzeige')
      .not('status', 'in', '(erledigt,nicht_noetig)')
      .maybeSingle();
    if (schritt) await setStepStatus(svc, (schritt as { id: string }).id, 'erledigt', { userId: user.id, kommentar: 'Anzeige zur Freigabe beim Kunden' });
  }
  return NextResponse.json({ anzeige: await aktuelleKarte(svc, id) });
}
