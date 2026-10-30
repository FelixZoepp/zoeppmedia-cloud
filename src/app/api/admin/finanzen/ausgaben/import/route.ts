import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { leseAmexCsv } from '@/lib/finanzen/ausgaben';

/** Cash-Plan: Amex-CSV importieren (doppelte Umsätze werden übersprungen) */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const datei = form?.get('datei');
  if (!(datei instanceof File)) return NextResponse.json({ error: 'Keine Datei' }, { status: 400 });
  if (datei.size > 2_000_000) return NextResponse.json({ error: 'Datei zu groß (max. 2 MB)' }, { status: 400 });
  if (!/\.csv$/i.test(datei.name)) return NextResponse.json({ error: 'Bitte den CSV-Export aus dem Amex-Onlinekonto hochladen' }, { status: 400 });
  const { zeilen, fehler } = leseAmexCsv(await datei.text(), datei.name);
  if (fehler) return NextResponse.json({ error: fehler }, { status: 400 });
  const svc = createAdminClient();
  let neu = 0;
  for (let i = 0; i < zeilen.length; i += 200) {
    const { data, error } = await svc
      .from('finanz_ausgaben')
      .upsert(zeilen.slice(i, i + 200), { onConflict: 'schluessel', ignoreDuplicates: true })
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    neu += data?.length ?? 0;
  }
  return NextResponse.json({ gelesen: zeilen.length, neu, doppelt: zeilen.length - neu });
}
