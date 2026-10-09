import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { darfKundenCloud } from '@/lib/kunden-cloud/zugriff';
import { ladeErfolg, ladeKundenZahlen, MANUELL_KEY, pruefeWerte } from '@/lib/kunden-cloud/erfolg';

/** GET /api/innendienst/erfolg – Zahlen für die Erfolgs-Anzeige (manuell eingetragen oder live) */
export async function GET() {
  const user = await getCurrentUser();
  if (!darfKundenCloud(user)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  try {
    const svc = createAdminClient();
    const [gesamt, kunden] = await Promise.all([ladeErfolg(svc), ladeKundenZahlen(svc)]);
    return NextResponse.json({ ...gesamt, kundenListe: kunden, darfBearbeiten: user?.role === 'admin' });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}

/** PUT { kunden, bewerbungen, einstellungen, tage? } | { zuruecksetzen: true } – nur Admins */
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const svc = createAdminClient();
  if (b.zuruecksetzen) {
    const { error } = await svc.from('system_einstellungen').delete().eq('key', MANUELL_KEY);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const w = pruefeWerte(b);
    if (!w) return NextResponse.json({ error: 'Bitte ganze Zahlen ≥ 0 eintragen (Tage 1–7)' }, { status: 400 });
    const { error } = await svc.from('system_einstellungen').upsert({ key: MANUELL_KEY, wert: JSON.stringify(w), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const [gesamt, kunden] = await Promise.all([ladeErfolg(svc), ladeKundenZahlen(svc)]);
  return NextResponse.json({ ...gesamt, kundenListe: kunden, darfBearbeiten: true });
}
