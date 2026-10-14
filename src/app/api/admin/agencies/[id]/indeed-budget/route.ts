import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { ersterStart, indeedKosten, laufendePhase, leadpreis, type BudgetPhase } from '@/lib/werbekosten/indeed-budget';

const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const vorTagen = (n: number) => new Date(Date.now() - n * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

async function intern() {
  const u = await getCurrentUser();
  return u && isInternal(u.role) ? u : null;
}

/** Phasen + Kosten/Leadpreis (30 Tage und seit Start) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await intern())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
  const svc = createAdminClient();
  const { data } = await svc.from('indeed_budget').select('id, tagesbudget, start, ende').eq('agency_id', id).order('start', { ascending: false });
  const phasen = ((data ?? []) as BudgetPhase[]).map((p) => ({ ...p, tagesbudget: Number(p.tagesbudget) }));
  const h = heute();

  const zeitraum = async (von: string) => {
    const { count } = await svc.from('candidates').select('id', { count: 'exact', head: true }).eq('agency_id', id).eq('source', 'indeed').is('deleted_at', null).gte('created_at', `${von}T00:00:00+02:00`);
    const k = indeedKosten(phasen, von, h);
    return { von, kosten: k.kosten, tage: k.tage, bewerber: count ?? 0, leadpreis: leadpreis(k.kosten, count ?? 0) };
  };
  const start = ersterStart(phasen);
  return NextResponse.json({
    phasen,
    laeuft: !!laufendePhase(phasen, h),
    tage30: await zeitraum(vorTagen(29)),
    seitStart: start ? await zeitraum(start) : null,
  });
}

/** Neue Phase: { tagesbudget, start, ende? } – eine laufende Phase endet am Vortag */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await intern();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { tagesbudget?: unknown; start?: unknown; ende?: unknown };
  const tagesbudget = Number(String(b.tagesbudget ?? '').replace(',', '.'));
  const start = String(b.start ?? '');
  const ende = b.ende ? String(b.ende) : null;
  if (!Number.isFinite(tagesbudget) || tagesbudget < 0) return NextResponse.json({ error: 'Tagesbudget fehlt' }, { status: 400 });
  if (!DATUM.test(start) || (ende && (!DATUM.test(ende) || ende < start))) return NextResponse.json({ error: 'Datum prüfen' }, { status: 400 });

  const svc = createAdminClient();
  const vortag = new Date(Date.parse(`${start}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
  // Offene Phasen, die vor dem neuen Start begonnen haben, enden am Vortag
  await svc.from('indeed_budget').update({ ende: vortag }).eq('agency_id', id).is('ende', null).lt('start', start);
  const { error } = await svc.from('indeed_budget').insert({ agency_id: id, tagesbudget, start, ende, angelegt_von: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await pausiertMerken(svc, id, !!ende && ende < heute());
  return NextResponse.json({ ok: true });
}

/** Pausieren: { id, ende } setzt das Ende einer Phase. Löschen: { id, loeschen: true } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await intern())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { id?: string; ende?: string; loeschen?: boolean };
  if (!isUuid(id) || !b.id || !isUuid(b.id)) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
  const svc = createAdminClient();
  if (b.loeschen) {
    await svc.from('indeed_budget').delete().eq('id', b.id).eq('agency_id', id);
  } else {
    const ende = b.ende ?? heute();
    if (!DATUM.test(ende)) return NextResponse.json({ error: 'Datum prüfen' }, { status: 400 });
    const { error } = await svc.from('indeed_budget').update({ ende }).eq('id', b.id).eq('agency_id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const { data } = await svc.from('indeed_budget').select('tagesbudget, start, ende').eq('agency_id', id);
  await pausiertMerken(svc, id, !laufendePhase((data ?? []) as BudgetPhase[], heute()) && (data ?? []).length > 0);
  return NextResponse.json({ ok: true });
}

/** settings.indeed_pausiert für die Problem-Erkennung mitführen */
async function pausiertMerken(svc: ReturnType<typeof createAdminClient>, agencyId: string, pausiert: boolean) {
  const { data } = await svc.from('agencies').select('settings').eq('id', agencyId).maybeSingle();
  const settings = ((data as { settings: Record<string, unknown> | null } | null)?.settings ?? {}) as Record<string, unknown>;
  if (!!settings.indeed_pausiert === pausiert) return;
  await svc.from('agencies').update({ settings: { ...settings, indeed_pausiert: pausiert } }).eq('id', agencyId);
}
