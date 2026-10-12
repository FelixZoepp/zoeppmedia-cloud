import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ARTEN, ladeKandidaten, type EmpfehlungsArt } from '@/lib/empfehlungen/kandidaten';

export const maxDuration = 60;
const STATUS = ['vorgeschlagen', 'angefragt', 'zugesagt', 'erhalten', 'abgelehnt'];

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  return NextResponse.json({ kandidaten: await ladeKandidaten(createAdminClient()) });
}

/** Stand je Kunde und Art setzen (Anfrage läuft per Anruf – hier wird nur festgehalten) */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { agency_id?: string; art?: string; status?: string; notiz?: string; empfohlen_name?: string };
  if (!b.agency_id || !ARTEN.includes(b.art as EmpfehlungsArt) || !STATUS.includes(b.status ?? '')) return NextResponse.json({ error: 'Ungültige Angaben' }, { status: 400 });
  const { error } = await createAdminClient()
    .from('empfehlungen')
    .upsert(
      {
        agency_id: b.agency_id,
        art: b.art,
        status: b.status,
        notiz: b.notiz?.trim().slice(0, 1000) || null,
        empfohlen_name: b.empfohlen_name?.trim().slice(0, 200) || null,
        bearbeitet_von: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'agency_id,art' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
