import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeEintrag, nummernSchemaBereit } from '@/lib/twilio/nummer-server';

/**
 * Kundenportal „WhatsApp verbinden“: die von uns besorgte Nummer + Bestätigungscode von Meta live.
 * GET → { nummer, code_empfang_bis, codes } · POST { aktion: 'code_empfang' } → 15 Min. Code-Empfang öffnen.
 * Nur Inhaber (oder Admin in der Kunden-Cloud).
 */
const CODE_FENSTER_MIN = 15;

async function kontext() {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'agency_owner' && user.role !== 'admin')) return null;
  const agencyId = await getEffectiveAgencyId();
  return agencyId ? { agencyId } : null;
}

export async function GET() {
  const k = await kontext();
  if (!k) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const svc = createAdminClient();
  if (!(await nummernSchemaBereit(svc))) return NextResponse.json({ nummer: null, code_empfang_bis: null, codes: [] });
  const eintrag = await ladeEintrag(svc, k.agencyId);
  const nummer = eintrag?.status === 'gekauft' ? eintrag.nummer_e164 : null;
  if (!nummer) return NextResponse.json({ nummer: null, code_empfang_bis: null, codes: [] });
  const { data } = await svc
    .from('nummer_codes')
    .select('code, art, created_at')
    .eq('agency_id', k.agencyId)
    .not('code', 'is', null)
    .gte('created_at', new Date(Date.now() - 30 * 60_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(3);
  return NextResponse.json({ nummer, code_empfang_bis: eintrag?.code_empfang_bis ?? null, codes: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const k = await kontext();
  if (!k) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { aktion?: string };
  if (body.aktion !== 'code_empfang') return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
  const svc = createAdminClient();
  if (!(await nummernSchemaBereit(svc))) return NextResponse.json({ error: 'Noch nicht verfügbar' }, { status: 503 });
  const eintrag = await ladeEintrag(svc, k.agencyId);
  if (eintrag?.status !== 'gekauft') return NextResponse.json({ error: 'Für dich ist noch keine Nummer eingerichtet' }, { status: 400 });
  const bis = new Date(Date.now() + CODE_FENSTER_MIN * 60_000).toISOString();
  const { error } = await svc.from('kunden_telefonnummern').update({ code_empfang_bis: bis, updated_at: new Date().toISOString() }).eq('agency_id', k.agencyId);
  if (error) return NextResponse.json({ error: 'Konnte nicht gestartet werden' }, { status: 500 });
  return NextResponse.json({ ok: true, code_empfang_bis: bis });
}
