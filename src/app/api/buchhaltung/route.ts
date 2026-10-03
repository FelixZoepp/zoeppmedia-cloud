import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadRechnungsliste, markiereGeschrieben, lexVorschlaege, passtZu } from '@/lib/billing/rechnungsliste';
import {
  mahnwesenAktiv, mahnwesenAb, syncMahnfaelle, faelligerSchritt, naechsterSchritt, aktionErfassen, type MahnFall,
} from '@/lib/billing/mahnwesen';
import { MAHN_SCHRITTE, fill } from '@/lib/billing/mahnwesen-vorlagen';
import { sendMahnMail } from '@/lib/email/resend';
import { today } from '@/lib/fulfillment/views';

/** Zugriff: Admins und die Buchhaltung (Funktion backoffice). */
async function guard() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return null;
  if (user.role === 'admin') return user;
  const { data } = await createAdminClient().from('users').select('funktion').eq('id', user.id).maybeSingle();
  return (data as { funktion: string | null } | null)?.funktion === 'backoffice' ? user : null;
}

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const svc = createAdminClient();
  const monat = req.nextUrl.searchParams.get('monat') ?? today().slice(0, 7);

  const [{ rechnungen, fehlend }, vorschlaege, { data: faelle }, { data: me }] = await Promise.all([
    loadRechnungsliste(svc, monat),
    lexVorschlaege().catch(() => []),
    svc.from('dunning_cases').select('*').in('status', ['offen', 'anwalt']).order('zahlungsziel', { ascending: true }),
    svc.from('users').select('name').eq('id', user.id).maybeSingle(),
  ]);

  const heute = today();
  const name = (me as { name: string } | null)?.name ?? 'Petra';
  const { data: ag } = await svc.from('agencies').select('id, name, contact_name, phone, email, rechnungsmail, created_at, setup_betrag');
  const agencies = new Map(((ag ?? []) as Array<{ id: string; name: string; contact_name: string | null; phone: string | null; email: string | null; rechnungsmail: string | null; created_at: string; setup_betrag: number | null }>).map((a) => [a.id, a]));

  return NextResponse.json({
    monat,
    rechnungen,
    fehlend: fehlend.map((a) => ({
      ...a,
      vorschlag: a.lex_contact_id ? vorschlaege.find((v) => v.contactId === a.lex_contact_id) ?? null : vorschlaege.find((v) => passtZu(a.name, v.contactName)) ?? null,
    })),
    mahn: {
      aktiv: mahnwesenAktiv(),
      ab: mahnwesenAb(),
      faelle: ((faelle ?? []) as MahnFall[]).map((f) => {
        const s = faelligerSchritt(f, heute);
        const a = f.agency_id ? agencies.get(f.agency_id) : undefined;
        const vars = {
          VORNAME: (a?.contact_name ?? '').split(' ')[0] || 'Kunde',
          RECHNUNGSNUMMER: f.rechnungsnummer ?? '',
          NAME: name,
          TELEFON: '030 82684175',
          KUNDENNAME: a?.name ?? f.kontakt_name ?? '',
          DATUM_ABSCHLUSS: a ? new Date(a.created_at).toLocaleDateString('de-DE') : '',
          SUMME: f.betrag_offen != null ? `${Number(f.betrag_offen).toLocaleString('de-DE')} €` : '',
        };
        return {
          ...f,
          kunde: a?.name ?? null,
          telefon: a?.phone ?? null,
          kunden_mail: a?.rechnungsmail ?? a?.email ?? null,
          faellig: s
            ? {
                schritt: s.schritt,
                titel: s.titel,
                telefon: s.telefon ? fill(s.telefon, vars) : null,
                mail: s.mail ? { an: s.mail.an ?? null, betreff: fill(s.mail.betreff, vars), text: fill(s.mail.text, vars) } : null,
                whatsapp: s.whatsapp ? fill(s.whatsapp, vars) : null,
              }
            : null,
          naechster: naechsterSchritt(f) ? { titel: naechsterSchritt(f)!.schritt.titel, datum: naechsterSchritt(f)!.datum } : null,
        };
      }),
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const svc = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  switch (body.aktion) {
    case 'geschrieben': {
      await markiereGeschrieben(svc, body.zeile as never, (body.rechnungsnummer as string) ?? null, user.id);
      return NextResponse.json({ ok: true });
    }
    case 'vertragsdaten': {
      const patch: Record<string, unknown> = {};
      for (const k of ['vertragsstart', 'mrr', 'setup_betrag', 'lex_contact_id']) {
        if (k in body) patch[k] = body[k] === '' ? null : body[k];
      }
      await svc.from('agencies').update(patch).eq('id', body.agency_id as string);
      return NextResponse.json({ ok: true });
    }
    case 'mahn_sync': {
      if (!mahnwesenAktiv()) return NextResponse.json({ error: 'Mahnwesen ist ausgeschaltet' }, { status: 400 });
      return NextResponse.json(await syncMahnfaelle(svc));
    }
    case 'mahn_aktion': {
      if (!mahnwesenAktiv()) return NextResponse.json({ error: 'Mahnwesen ist ausgeschaltet' }, { status: 400 });
      const { case_id, schritt, ergebnis, notiz, zugesagt_bis, mail } = body as {
        case_id: string; schritt: number; ergebnis: 'erreicht' | 'nicht_erreicht' | 'abgegeben'; notiz?: string; zugesagt_bis?: string;
        mail?: { an: string; betreff: string; text: string } | null;
      };
      if (!MAHN_SCHRITTE.some((s) => s.schritt === schritt)) return NextResponse.json({ error: 'Unbekannter Schritt' }, { status: 400 });
      await aktionErfassen(svc, case_id, schritt, ergebnis, { userId: user.id, notiz, zugesagt_bis });
      // Nicht erreicht → Mail aus der Vorlage an den Kunden (WhatsApp folgt mit der Mahn-Nummer)
      if (ergebnis === 'nicht_erreicht' && mail?.an && mail.betreff && mail.text) {
        await sendMahnMail(mail.an, mail.betreff, mail.text);
        await aktionErfassen(svc, case_id, schritt, 'gesendet', { userId: user.id, notiz: `Mail an ${mail.an}` });
      }
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
  }
}
