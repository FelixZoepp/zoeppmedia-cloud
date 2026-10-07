import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { listeTranskripte } from '@/lib/gespraeche/fireflies';
import { kuerzeAlteNotizen, verarbeiteGespraech } from '@/lib/gespraeche/analyse';

export const maxDuration = 300;

async function erlaubt(req: NextRequest, svc: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const token = req.headers.get('x-sync-token');
  if (token) {
    const { data } = await svc.from('system_einstellungen').select('wert').eq('key', 'sync_token').maybeSingle();
    if ((data as { wert: string } | null)?.wert === token) return true;
  }
  const user = await getCurrentUser();
  return !!user && isInternal(user.role);
}

/** GET – letzte Gesprächsanalysen (intern) */
export async function GET(req: NextRequest) {
  const svc = createAdminClient();
  if (!(await erlaubt(req, svc))) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { data } = await svc
    .from('gespraech_analysen')
    .select('fireflies_id, titel, datum, dauer_min, status, punkte, zuordnung, close_lead_id, fehler, ergebnis')
    .order('datum', { ascending: false })
    .limit(100);
  return NextResponse.json({ gespraeche: data ?? [] });
}

/** POST { tage?, max?, erneut? } – Fireflies-Gespräche der letzten Tage nachholen (fehlende oder fehlgeschlagene) */
export async function POST(req: NextRequest) {
  const svc = createAdminClient();
  if (!(await erlaubt(req, svc))) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { tage?: number; max?: number; erneut?: boolean; aktion?: string };
  if (b.aktion === 'notizen_kuerzen') return NextResponse.json(await kuerzeAlteNotizen(svc));
  const tage = Math.min(60, Math.max(1, Number(b.tage) || 7));
  const max = Math.min(10, Math.max(1, Number(b.max) || 5));
  try {
    const liste = await listeTranskripte(new Date(Date.now() - tage * 864e5));
    const { data: vorhanden } = await svc.from('gespraech_analysen').select('fireflies_id, status').in('fireflies_id', liste.map((t) => t.id));
    // Fertig = schon in Close oder bewusst übersprungen; „kein Lead“ und Fehler werden erneut versucht (z. B. Lead inzwischen angelegt)
    const fertig = new Set(
      ((vorhanden ?? []) as Array<{ fireflies_id: string; status: string }>)
        .filter((v) => (b.erneut ? false : v.status === 'in_close' || v.status === 'uebersprungen'))
        .map((v) => v.fireflies_id),
    );
    const offen = liste.filter((t) => !fertig.has(t.id)).slice(0, max);
    const ergebnisse: Array<{ id: string; titel: string | null; ergebnis: string }> = [];
    for (const t of offen) ergebnisse.push({ id: t.id, titel: t.title, ergebnis: await verarbeiteGespraech(svc, t.id, { erneut: b.erneut }) });
    return NextResponse.json({ gefunden: liste.length, verarbeitet: ergebnisse, rest: Math.max(0, liste.filter((t) => !fertig.has(t.id)).length - offen.length) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 502 });
  }
}
