import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { berlinTagVon } from '@/lib/zeit/berlin';
import {
  aktuellerMonat,
  csv,
  eintragMinuten,
  istMonat,
  istUeberlang,
  kosten,
  monatAuswerten,
  stunden,
  taetigkeitLabel,
} from '@/lib/zeiten/rechnen';
import { SCHEMA_FEHLT, STUNDENSATZ_KEY, eintraegeImMonat, kundenListe, stundensatzLaden } from '@/lib/zeiten/server';

export const dynamic = 'force-dynamic';

const uhr = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });

/**
 * GET ?monat=YYYY-MM – Stunden je Mitarbeiter und je Kunde (mit Kosten und MRR), Einträge zum Prüfen.
 * ?format=csv&art=eintraege|kunden|mitarbeiter – CSV-Export (Excel, Semikolon).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const svc = createAdminClient();
  const sp = req.nextUrl.searchParams;
  const monat = istMonat(sp.get('monat') ?? '') ? sp.get('monat')! : aktuellerMonat();
  const jetzt = new Date();

  const [{ schema, eintraege }, stundensatz, kunden, { data: users }] = await Promise.all([
    eintraegeImMonat(svc, monat),
    stundensatzLaden(svc),
    kundenListe(svc),
    svc.from('users').select('id, name, email, funktion').in('role', ['admin', 'employee']),
  ]);
  const nutzer = new Map(((users ?? []) as Array<{ id: string; name: string | null; email: string; funktion: string | null }>).map((u) => [u.id, u]));
  const kundenMap = new Map(kunden.map((k) => [k.id, k]));
  const name = (id: string) => nutzer.get(id)?.name || nutzer.get(id)?.email || 'Unbekannt';
  const kundeName = (id: string | null) => (id ? kundenMap.get(id)?.name ?? 'Gelöschter Kunde' : 'Intern');
  const a = monatAuswerten(eintraege, stundensatz, jetzt);

  if (sp.get('format') === 'csv') {
    const art = sp.get('art') ?? 'eintraege';
    let inhalt: string;
    if (art === 'kunden') {
      inhalt = csv(
        ['Kunde', 'Stunden', 'Kosten €', 'MRR €', 'Marge €'],
        a.proKunde.map((k) => {
          const mrr = k.agencyId ? kundenMap.get(k.agencyId)?.mrr ?? null : null;
          return [kundeName(k.agencyId), stunden(k.minuten), k.kosten, mrr, mrr === null ? null : Math.round((mrr - k.kosten) * 100) / 100];
        }),
      );
    } else if (art === 'mitarbeiter') {
      inhalt = csv(['Mitarbeiter', 'Stunden', 'Kosten €', 'Einträge'], a.proMitarbeiter.map((m) => [name(m.userId), stunden(m.minuten), m.kosten, m.eintraege]));
    } else {
      inhalt = csv(
        ['Datum', 'Beginn', 'Ende', 'Mitarbeiter', 'Kunde', 'Tätigkeit', 'Minuten', 'Stunden', 'Kosten €', 'Notiz', 'Prüfen'],
        eintraege.map((e) => {
          const min = e.ende ? eintragMinuten(e, jetzt) : null;
          return [
            berlinTagVon(e.start),
            uhr.format(new Date(e.start)),
            e.ende ? uhr.format(new Date(e.ende)) : 'läuft',
            name(e.user_id),
            kundeName(e.agency_id),
            taetigkeitLabel(e.taetigkeit),
            min,
            min === null ? null : stunden(min),
            min === null ? null : kosten(min, stundensatz),
            e.notiz,
            istUeberlang(e, jetzt) ? 'über 10 h' : '',
          ];
        }),
      );
    }
    return new NextResponse(inhalt, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="zeiten-${art}-${monat}.csv"`,
      },
    });
  }

  return NextResponse.json({
    schema,
    hinweis: schema ? null : SCHEMA_FEHLT,
    monat,
    stundensatz,
    gesamt: a.gesamt,
    laufend: a.laufend,
    proMitarbeiter: a.proMitarbeiter.map((m) => ({ ...m, name: name(m.userId), funktion: nutzer.get(m.userId)?.funktion ?? null })),
    proKunde: a.proKunde.map((k) => ({
      ...k,
      name: kundeName(k.agencyId),
      mrr: k.agencyId ? kundenMap.get(k.agencyId)?.mrr ?? null : null,
    })),
    zuPruefen: eintraege
      .filter((e) => istUeberlang(e, jetzt))
      .map((e) => ({ id: e.id, start: e.start, ende: e.ende, minuten: eintragMinuten(e, jetzt), name: name(e.user_id), kunde: kundeName(e.agency_id), taetigkeit: e.taetigkeit })),
  });
}

/** PATCH { stundensatz } – interner Stundensatz in € (system_einstellungen 'stundensatz_intern') */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { stundensatz?: unknown };
  const satz = parseFloat(String(b.stundensatz ?? '').replace(',', '.'));
  if (!Number.isFinite(satz) || satz <= 0 || satz >= 1000) return NextResponse.json({ error: 'Stundensatz bitte zwischen 1 und 999 €' }, { status: 400 });
  const wert = String(Math.round(satz * 100) / 100);
  const svc = createAdminClient();
  const { error } = await svc.from('system_einstellungen').upsert({ key: STUNDENSATZ_KEY, wert, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, stundensatz: Number(wert) });
}
