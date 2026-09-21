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
  if (!agencyId) return NextResponse.json([]);

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

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
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

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'ID erforderlich' }, { status: 400 });

  const svc = createAdminClient();
  await svc.from('quick_replies').delete().eq('id', id).eq('agency_id', agencyId);

  return NextResponse.json({ ok: true });
}
