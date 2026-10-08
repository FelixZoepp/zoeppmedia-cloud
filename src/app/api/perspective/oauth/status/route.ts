import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { trennen, verbindungsStatus } from '@/lib/perspective/oauth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await verbindungsStatus(createAdminClient()));
}

/** Verbindung trennen (nur Admins) */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur Admins' }, { status: 403 });
  const svc = createAdminClient();
  await trennen(svc);
  return NextResponse.json(await verbindungsStatus(svc));
}
