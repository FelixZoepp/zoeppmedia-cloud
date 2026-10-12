import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadRechnungsliste, markiereGeschrieben, lexVorschlaege, passtZu } from '@/lib/billing/rechnungsliste';
import {
  ladeStichtag, setzeStichtag, syncMahnfaelle, planeMahnAufgaben, faelligerSchritt, naechsterSchritt, aktionErfassen, erledigeMahnAufgaben,
  berechneMahnBericht, type MahnFall,
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
    svc.from('dunning_cases').select('*').order('zahlungsziel', { ascending: true }),
    svc.from('users').select('name').eq('id', user.id).maybeSingle(),
  ]);

  const heute = today();
  const name = (me as { name: string } | null)?.name ?? 'Petra';
  const alle = (faelle ?? []) as MahnFall[];
  const sichtbar = alle.filter((f) => f.status === 'offen' || f.status === 'anwalt');
  const ids = sichtbar.map((f) => f.id);
  const [{ data: akt }, { data: punkte }, { data: us }, stichtag] = await Promise.all([
    ids.length ? svc.from('dunning_actions').select('id, case_id, schritt, ergebnis, kanal, notiz, details, zugesagt_bis, user_id, created_at').in('case_id', ids).order('created_at', { ascending: false }).limit(2000) : Promise.resolve({ data: [] }),
    ids.length ? svc.from('cockpit_punkte').select('id, dunning_case_id, titel, empfehlung, status, notiz, entschieden_am, created_at').in('dunning_case_id', ids).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    svc.from('users').select('id, name').in('role', ['admin', 'employee']),
    ladeStichtag(svc),
  ]);
  const userName = new Map(((us ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name]));
  const verlauf = new Map<string, unknown[]>();
  for (const a of (akt ?? []) as Array<{ case_id: string; user_id: string | null } & Record<string, unknown>>) {
    verlauf.set(a.case_id, [...(verlauf.get(a.case_id) ?? []), { ...a, von: a.user_id ? userName.get(a.user_id) ?? null : null }]);
  }
  const entscheidungen = new Map<string, unknown[]>();
  for (const p of (punkte ?? []) as Array<{ dunning_case_id: string } & Record<string, unknown>>) {
    entscheidungen.set(p.dunning_case_id, [...(entscheidungen.get(p.dunning_case_id) ?? []), p]);
  }
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
      ab: stichtag,
      bericht: berechneMahnBericht(alle.map((f) => ({ ...f, kunde: f.agency_id ? agencies.get(f.agency_id)?.name ?? null : null })), heute),
      faelle: sichtbar.map((f) => {
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
          verlauf: verlauf.get(f.id) ?? [],
          entscheidungen: entscheidungen.get(f.id) ?? [],
        };
      }),
    },
  });
}

const kurz = (t: string | null | undefined, max = 2000) => (typeof t === 'string' && t.trim() ? t.trim().slice(0, max) : null);
const datumOk = (d: string | null | undefined) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

export async function POST(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const svc = createAdminClient();
  const { data: agRows } = await svc.from('agencies').select('id, name');
  const agencies = new Map(((agRows ?? []) as Array<{ id: string; name: string }>).map((a) => [a.id, a]));
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
    case 'mahn_stichtag': {
      try {
        await setzeStichtag(svc, String(body.ab ?? ''));
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Fehler' }, { status: 400 });
      }
      const erg = await syncMahnfaelle(svc).catch((e) => ({ fehler: String(e) }));
      await planeMahnAufgaben(svc, today());
      return NextResponse.json({ ok: true, ...erg });
    }
    case 'mahn_sync': {
      if (!(await ladeStichtag(svc))) return NextResponse.json({ error: 'Bitte zuerst den Stichtag festlegen' }, { status: 400 });
      const erg = await syncMahnfaelle(svc);
      const aufgaben = await planeMahnAufgaben(svc, today());
      return NextResponse.json({ ...erg, ...aufgaben });
    }
    case 'mahn_aktion': {
      // Anruf protokollieren (verschickt nichts)
      const { case_id, schritt, ergebnis, notiz, zugesagt_bis } = body as {
        case_id: string; schritt: number; ergebnis: 'erreicht' | 'nicht_erreicht' | 'abgegeben'; notiz?: string; zugesagt_bis?: string;
      };
      if (!MAHN_SCHRITTE.some((s) => s.schritt === schritt)) return NextResponse.json({ error: 'Unbekannter Schritt' }, { status: 400 });
      if (!['erreicht', 'nicht_erreicht', 'abgegeben'].includes(ergebnis)) return NextResponse.json({ error: 'Unbekanntes Ergebnis' }, { status: 400 });
      await aktionErfassen(svc, case_id, schritt, ergebnis, { userId: user.id, notiz: kurz(notiz), zugesagt_bis: datumOk(zugesagt_bis), kanal: ergebnis === 'abgegeben' ? 'mail' : 'anruf' });
      return NextResponse.json({ ok: true });
    }
    case 'mahn_mail': {
      // Von der Buchhaltung geprüfte (ggf. angepasste) Mail – wird erst auf ihren Klick verschickt
      const { case_id, schritt, an, betreff, text } = body as { case_id: string; schritt: number; an: string; betreff: string; text: string };
      if (!MAHN_SCHRITTE.some((s) => s.schritt === schritt)) return NextResponse.json({ error: 'Unbekannter Schritt' }, { status: 400 });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(an ?? '') || !betreff?.trim() || !text?.trim()) return NextResponse.json({ error: 'Empfänger, Betreff und Text prüfen' }, { status: 400 });
      const { error } = await sendMahnMail(an.trim(), betreff.trim().slice(0, 200), text.slice(0, 10000));
      if (error) return NextResponse.json({ error: `Mail nicht verschickt: ${error.message}` }, { status: 502 });
      await aktionErfassen(svc, case_id, schritt, 'gesendet', { userId: user.id, kanal: 'mail', notiz: `Mail an ${an.trim()}: ${betreff.trim()}`, details: { betreff: betreff.trim(), text: text.slice(0, 10000) } });
      return NextResponse.json({ ok: true });
    }
    case 'mahn_whatsapp': {
      // WhatsApp verschickt sie selbst (Link öffnet WhatsApp mit dem Text) – hier nur festhalten
      const { case_id, schritt, text } = body as { case_id: string; schritt: number; text: string };
      if (!MAHN_SCHRITTE.some((s) => s.schritt === schritt)) return NextResponse.json({ error: 'Unbekannter Schritt' }, { status: 400 });
      await aktionErfassen(svc, case_id, schritt, 'gesendet', { userId: user.id, kanal: 'whatsapp', notiz: 'WhatsApp verschickt', details: { text: String(text ?? '').slice(0, 5000) } });
      return NextResponse.json({ ok: true });
    }
    case 'mahn_notiz': {
      const notiz = kurz(body.notiz as string);
      if (!notiz) return NextResponse.json({ error: 'Notiz ist leer' }, { status: 400 });
      await aktionErfassen(svc, body.case_id as string, 0, 'notiz', { userId: user.id, kanal: 'notiz', notiz, zugesagt_bis: datumOk(body.zugesagt_bis as string) });
      return NextResponse.json({ ok: true });
    }
    case 'mahn_krise': {
      const k = body as { case_id: string; grund?: string; vereinbarung?: string; raten?: string; betrag?: string; naechster_kontakt?: string; einschaetzung?: string; notiz?: string };
      const einschaetzung = ['zahlt', 'unsicher', 'ausfall'].includes(k.einschaetzung ?? '') ? k.einschaetzung! : null;
      const details = {
        grund: kurz(k.grund), vereinbarung: kurz(k.vereinbarung), raten: kurz(k.raten), betrag: kurz(k.betrag),
        naechster_kontakt: datumOk(k.naechster_kontakt), einschaetzung,
      };
      await aktionErfassen(svc, k.case_id, 0, 'krisengespraech', { userId: user.id, kanal: 'krisengespraech', notiz: kurz(k.notiz), details, zugesagt_bis: details.naechster_kontakt });
      if (einschaetzung) await svc.from('dunning_cases').update({ einschaetzung, updated_at: new Date().toISOString() }).eq('id', k.case_id);
      return NextResponse.json({ ok: true });
    }
    case 'mahn_eskalation': {
      // Entscheidung durch die Geschäftsführung: landet im Cockpit + Briefing, Antwort kommt zurück an den Fall
      const { case_id, frage, empfehlung } = body as { case_id: string; frage: string; empfehlung?: string };
      if (!frage?.trim()) return NextResponse.json({ error: 'Bitte die Frage an Felix eintragen' }, { status: 400 });
      const { data: fall } = await svc.from('dunning_cases').select('id, agency_id, kontakt_name, rechnungsnummer, betrag_offen').eq('id', case_id).maybeSingle();
      if (!fall) return NextResponse.json({ error: 'Fall nicht gefunden' }, { status: 404 });
      const f = fall as { id: string; agency_id: string | null; kontakt_name: string | null; rechnungsnummer: string | null; betrag_offen: number | null };
      const kunde = (f.agency_id && agencies.get(f.agency_id)?.name) || f.kontakt_name || 'Kunde';
      const { data: chef } = await svc.from('users').select('id').eq('role', 'admin').order('created_at', { ascending: true }).limit(1).maybeSingle();
      const chefId = (chef as { id: string } | null)?.id ?? null;
      const faellig = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
      const { data: punkt, error } = await svc
        .from('cockpit_punkte')
        .insert({
          typ: 'entscheidung',
          titel: `💶 ${kunde} (${f.rechnungsnummer ?? ''}, ${Number(f.betrag_offen ?? 0).toLocaleString('de-DE')} €): ${frage.trim().slice(0, 300)}`,
          empfehlung: kurz(empfehlung),
          owner_user_id: chefId,
          faellig_am: faellig,
          status: 'offen',
          erstellt_von: user.id,
          dunning_case_id: f.id,
        })
        .select('id')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await aktionErfassen(svc, f.id, 0, 'eskalation', { userId: user.id, kanal: 'eskalation', notiz: frage.trim().slice(0, 300), details: { punkt_id: (punkt as { id: string }).id, empfehlung: kurz(empfehlung) } });
      if (chefId) {
        const { createNotification } = await import('@/lib/notifications/create');
        await createNotification(svc, { user_id: chefId, title: `🧭 Entscheidung Mahnwesen: ${kunde}`, body: frage.trim().slice(0, 200), type: 'system', push_url: '/admin' }).catch(() => {});
      }
      return NextResponse.json({ ok: true });
    }
    case 'mahn_status': {
      // Manuell: bezahlt (z. B. bar/Verrechnung), ignoriert (Altfall), storniert
      const status = body.status as string;
      if (!['bezahlt', 'ignoriert', 'storniert', 'offen'].includes(status)) return NextResponse.json({ error: 'Unbekannter Status' }, { status: 400 });
      await svc.from('dunning_cases').update({ status, bezahlt_am: status === 'bezahlt' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', body.case_id as string);
      await aktionErfassen(svc, body.case_id as string, 0, 'status', { userId: user.id, kanal: 'status', notiz: `Status: ${status}${body.notiz ? ` – ${kurz(body.notiz as string)}` : ''}` });
      if (status !== 'offen') await erledigeMahnAufgaben(svc, [body.case_id as string]);
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
  }
}
