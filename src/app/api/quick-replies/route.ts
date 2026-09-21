import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const CreateSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(2000),
  shortcut: z.string().max(20).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  // C1: consistent with POST/DELETE — return 403 instead of empty array
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const svc = createAdminClient();
  const { data } = await svc
    .from('quick_replies')
    .select('id, title, body, shortcut')
    .eq('agency_id', agencyId)
    .order('title');

  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  // I1: wrap request.json() in try/catch
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: 'Validierungsfehler' }, { status: 400 });

  const svc = createAdminClient();
  const { data, error } = await svc
    .from('quick_replies')
    .insert({ agency_id: agencyId, ...parsed.data })
    .select('id, title, body, shortcut')
    .single();

  if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  // I1: wrap request.json() in try/catch
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  const { id } = rawBody as { id?: string };
  if (!id) return NextResponse.json({ error: 'ID erforderlich' }, { status: 400 });

  const svc = createAdminClient();
  // C2: capture result, check for error and empty data
  const { data, error } = await svc
    .from('quick_replies')
    .delete()
    .eq('id', id)
    .eq('agency_id', agencyId)
    .select('id');

  if (error) return NextResponse.json({ error: 'Löschen fehlgeschlagen' }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
