import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeCockpit } from '@/lib/cockpit/laden';

export const maxDuration = 60;

/** GET – Cockpit (Admin) */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  return NextResponse.json(await ladeCockpit(createAdminClient()));
}

const TYPEN = ['entscheidung', 'prioritaet'];
const STATUS = ['offen', 'ja', 'nein', 'erledigt', 'verschoben'];

/**
 * POST { typ, titel, empfehlung?, owner_user_id?, faellig_am? } – Entscheidung/Priorität anlegen (ganzes Team,
 * damit Entscheidungen als Vorschlag vorbereitet ins Meeting kommen)
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, string | undefined>;
  const titel = b.titel?.trim();
  if (!b.typ || !TYPEN.includes(b.typ) || !titel) return NextResponse.json({ error: 'Typ und Titel sind Pflicht' }, { status: 400 });
  const { data, error } = await createAdminClient()
    .from('cockpit_punkte')
    .insert({
      typ: b.typ,
      titel: titel.slice(0, 300),
      empfehlung: b.empfehlung?.trim().slice(0, 2000) || null,
      owner_user_id: b.owner_user_id || null,
      faellig_am: b.faellig_am || null,
      erstellt_von: user.id,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** PATCH { id, status?, notiz?, owner_user_id?, faellig_am? } – entscheiden/abhaken (Admin) */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, string | undefined>;
  if (!b.id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (b.status !== undefined) {
    if (!STATUS.includes(b.status)) return NextResponse.json({ error: 'Unbekannter Status' }, { status: 400 });
    patch.status = b.status;
    patch.entschieden_am = b.status === 'offen' ? null : new Date().toISOString();
  }
  if (b.notiz !== undefined) patch.notiz = b.notiz.trim().slice(0, 2000) || null;
  if (b.owner_user_id !== undefined) patch.owner_user_id = b.owner_user_id || null;
  if (b.faellig_am !== undefined) patch.faellig_am = b.faellig_am || null;
  const { error } = await createAdminClient().from('cockpit_punkte').update(patch).eq('id', b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
