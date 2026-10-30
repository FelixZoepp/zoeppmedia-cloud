import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { liesZiele, ZIELE_KEY } from '@/lib/finanzen/ziele';

/** Masterplan-Ziele im Cash-Plan (nur Admins) */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const svc = createAdminClient();
  const seit = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [{ data }, { data: kunden }, { data: tage }] = await Promise.all([
    svc.from('system_einstellungen').select('wert').eq('key', ZIELE_KEY).maybeSingle(),
    svc.from('finanz_kunden_status').select('upsell, rueckgewinnung, lex_kontakte').eq('segment', 'd2d'),
    svc.from('kennzahlen_tage').select('tag, bereich, werte').gte('tag', seit),
  ]);
  // Funnel der letzten 30 Tage (Tageskennzahlen Marketing + Sales)
  const summe = (bereich: string, feld: string) =>
    (tage ?? []).filter((t) => t.bereich === bereich).reduce((s, t) => s + (Number((t.werte as Record<string, unknown>)?.[feld]) || 0), 0);
  const funnel = {
    tage: new Set((tage ?? []).map((t) => t.tag)).size,
    ausgaben: Math.round(summe('marketing', 'ausgaben')),
    leads: summe('marketing', 'metaLeads') || summe('sales', 'eintragungen'),
    settingsGebucht: summe('sales', 'settingsGebucht'),
    settingsGehalten: summe('sales', 'settingsGehalten'),
    closingsGebucht: summe('sales', 'closingsGebucht'),
    closingsGehalten: summe('sales', 'closingsGehalten'),
    abschluesse: summe('sales', 'abschluesse'),
  };
  // Bewertete Direktvertriebskunden (Angabe Felix) – genauer als die Schätzung aus den Lexware-Beträgen
  const bewertet = (kunden ?? []).filter((k) => k.upsell != null);
  const historie = bewertet.length
    ? { kunden: bewertet.length, upsell: bewertet.filter((k) => k.upsell).length, rueckgewinnung: (kunden ?? []).filter((k) => k.rueckgewinnung).length }
    : null;
  // Lexware-Kontakte der Direktvertriebskunden – Churn/Neukunden nur über dieses Segment
  const d2dKontakte = [...new Set((kunden ?? []).flatMap((k) => (k.lex_kontakte as string[] | null) ?? []))];
  return NextResponse.json({ ziele: liesZiele(data?.wert ?? null), historie, d2dKontakte, funnel });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const ziele = liesZiele(await req.json().catch(() => null));
  const { error } = await createAdminClient().from('system_einstellungen').upsert({ key: ZIELE_KEY, wert: JSON.stringify(ziele) }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ziele });
}
