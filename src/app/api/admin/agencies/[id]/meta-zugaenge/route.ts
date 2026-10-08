import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { pruefeUndUebernehme } from '@/lib/meta/zugaenge';

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** GET – letzte Zugangsprüfung */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const { data } = await createAdminClient().from('agencies').select('meta_zugang_pruefung').eq('id', id).maybeSingle();
  return NextResponse.json({ pruefung: (data as { meta_zugang_pruefung: unknown } | null)?.meta_zugang_pruefung ?? null });
}

/** POST – Zugänge jetzt per Meta-API prüfen (nur lesend) und Ergebnis in den Ablauf übernehmen */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  if (!process.env.META_SYSTEM_USER_TOKEN) return NextResponse.json({ error: 'META_SYSTEM_USER_TOKEN ist nicht gesetzt' }, { status: 503 });
  try {
    return NextResponse.json(await pruefeUndUebernehme(createAdminClient(), id, { userId: user.id }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Prüfung fehlgeschlagen' }, { status: 500 });
  }
}
