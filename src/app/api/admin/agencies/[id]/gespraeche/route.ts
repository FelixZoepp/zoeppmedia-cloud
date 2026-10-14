import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';

/** Kundengespräche (Fireflies) eines Kunden mit Auswertung */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
  const { data, error } = await createAdminClient()
    .from('kunden_gespraeche')
    .select('id, fireflies_id, titel, datum, dauer_min, art, stimmung, stimmung_score, auswertung, aufgaben_angelegt')
    .eq('agency_id', id)
    .order('datum', { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gespraeche: data ?? [] });
}
