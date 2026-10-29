import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  BRIEF_MIN_ANZEIGE,
  briefAlsFunnelLead,
  briefCalendlyUrl,
  briefOriginErlaubt,
  briefZaehler,
  leseBriefAnfrage,
  leseBriefToken,
} from '@/lib/sales/brief';

/**
 * Öffentlich: „Brief an die Vertriebsleiter“ auf der Felix-Zoepp-Website.
 *   GET  → echte Zähler (erst ab BRIEF_MIN_ANZEIGE)
 *   POST { art: 'offen' | 'ende' | 'fragen', besucher, l?, utm? } → Lesen zählen (je Browser einmal)
 *   POST { art: 'anfrage', name, firma, tel, branche, rolle, team, ziel, besucher, l?, utm? } → Close-Lead + Calendly-Link
 * Keine Nachricht an den Lead von hier aus – Folgeschritte laufen über die normale Funnel-Strecke.
 */

function cors(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get('origin');
  if (briefOriginErlaubt(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin!);
    res.headers.set('Vary', 'Origin');
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return res;
}

export function OPTIONS(req: NextRequest) {
  return cors(req, new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const z = await briefZaehler(createAdminClient());
  const sichtbar = z.geoeffnet >= BRIEF_MIN_ANZEIGE;
  return cors(
    req,
    NextResponse.json(sichtbar ? z : { geoeffnet: null, ende: null }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }),
  );
}

const ip = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unbekannt';

export async function POST(req: NextRequest) {
  if (!briefOriginErlaubt(req.headers.get('origin'))) return NextResponse.json({ error: 'Nicht erlaubt' }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return cors(req, NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 }));

  const svc = createAdminClient();
  const besucher = typeof body.besucher === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.besucher) ? body.besucher : null;
  const leadAusLink = leseBriefToken(typeof body.l === 'string' ? body.l : null);
  const utm = (body.utm && typeof body.utm === 'object' ? body.utm : {}) as Record<string, unknown>;
  const quelle = typeof utm.source === 'string' ? utm.source.slice(0, 60) : leadAusLink ? 'followup' : null;
  const kampagne = typeof utm.campaign === 'string' ? utm.campaign.slice(0, 120) : null;
  const art = body.art;

  if (art === 'offen' || art === 'ende' || art === 'fragen') {
    if (!besucher) return cors(req, NextResponse.json({ error: 'Besucher fehlt' }, { status: 400 }));
    if (!(await checkRateLimit(svc, `brief:event:${ip(req)}`, 60, 3600))) return cors(req, NextResponse.json({ ok: true }));
    const { error } = await svc.from('sales_brief_events').insert({ besucher, art, lead_id: leadAusLink, quelle, kampagne });
    // Persönlicher Link: einmal je Browser eine Notiz am Close-Lead (Felix sieht, wer den Brief liest)
    if (!error && leadAusLink && art !== 'fragen') {
      const { addCloseNote } = await import('@/lib/sales/close');
      await addCloseNote(leadAusLink, art === 'offen' ? '📨 Hat den Brief an die Vertriebsleiter geöffnet' : '📨 Hat den Brief an die Vertriebsleiter bis zum Ende gelesen').catch(
        (e) => console.error('[brief] Notiz:', e),
      );
    }
    return cors(req, NextResponse.json({ ok: true }));
  }

  if (art === 'anfrage') {
    if (body.website) return cors(req, NextResponse.json({ ok: true, calendly: briefCalendlyUrl('') })); // Honeypot
    if (!(await checkRateLimit(svc, `brief:anfrage:${ip(req)}`, 5, 3600))) {
      return cors(req, NextResponse.json({ error: 'Zu viele Anfragen – bitte später noch einmal.' }, { status: 429 }));
    }
    const anfrage = leseBriefAnfrage(body);
    if (!anfrage) return cors(req, NextResponse.json({ error: 'Name, Firma und Telefon fehlen' }, { status: 400 }));
    if (!anfrage.utm.source && leadAusLink) anfrage.utm.source = 'followup';

    const calendly = briefCalendlyUrl(anfrage.name, anfrage.utm.source ?? 'brief');
    try {
      const { uebernehmeFunnelLead } = await import('@/lib/sales/funnel-lead');
      const ergebnis = await uebernehmeFunnelLead(briefAlsFunnelLead(anfrage));
      if (besucher) await svc.from('sales_brief_events').insert({ besucher, art: 'anfrage', lead_id: ergebnis.leadId, quelle, kampagne });
      if (ergebnis.neu) {
        await svc
          .from('lead_herkunft')
          .upsert(
            { lead_id: ergebnis.leadId, quelle: 'brief', utm_source: anfrage.utm.source, utm_medium: anfrage.utm.medium, utm_campaign: anfrage.utm.campaign, utm_term: anfrage.utm.term ?? null, utm_content: anfrage.utm.content },
            { onConflict: 'lead_id', ignoreDuplicates: true },
          )
          .then(({ error }) => error && console.error('[brief] Herkunft:', error.message));
        const { planeCapiEvent } = await import('@/lib/meta/capi');
        await planeCapiEvent(svc, { name: 'Lead', eventId: `lead_brief_${ergebnis.leadId}`, closeLeadId: ergebnis.leadId, zeit: new Date(), kontakt: { phone: anfrage.telefon, name: anfrage.name } });
      }
      await svc.from('events_inbox').insert({ source: 'sales_brief', external_id: null, payload: { ...anfrage, lead_id: ergebnis.leadId, neu: ergebnis.neu }, status: 'done', processed_at: new Date().toISOString() });
      return cors(req, NextResponse.json({ ok: true, calendly }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fehler';
      console.error('[brief] Anfrage:', msg);
      await svc.from('events_inbox').insert({ source: 'sales_brief', external_id: null, payload: anfrage, status: 'failed', error: msg, processed_at: new Date().toISOString() });
      // Der Leser kommt trotzdem zum Kalender – die Anfrage steht im Protokoll und wird vom Wächter gemeldet
      return cors(req, NextResponse.json({ ok: true, calendly }));
    }
  }

  return cors(req, NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 }));
}
