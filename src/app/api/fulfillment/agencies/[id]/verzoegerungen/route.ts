import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/** Verzögerung manuell erfassen (Tage, wer, Grund) – fließt in die Start-Analyse. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  const { tage, wer, grund } = (await req.json().catch(() => ({}))) as { tage?: number; wer?: string; grund?: string };
  if (!tage || tage <= 0 || (wer !== 'kunde' && wer !== 'zoepp') || !grund?.trim()) {
    return NextResponse.json({ error: 'Tage, wer und Grund sind Pflicht' }, { status: 400 });
  }
  const { error } = await createAdminClient()
    .from('start_verzoegerungen')
    .insert({ agency_id: id, tage, wer, grund: grund.trim().slice(0, 500), created_by: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  const eintrag = req.nextUrl.searchParams.get('eintrag');
  if (!eintrag) return NextResponse.json({ error: 'eintrag fehlt' }, { status: 400 });
  await createAdminClient().from('start_verzoegerungen').delete().eq('id', eintrag).eq('agency_id', id);
  return NextResponse.json({ ok: true });
}
