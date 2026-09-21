/**
 * GET /api/team/members
 *
 * Gibt alle Nutzer der aktuellen Agentur zurück (für das Zuweisungs-Dropdown in der Inbox).
 * Phase 3 Task 11.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const svc = createAdminClient();

  const { data: members, error } = await svc
    .from('users')
    .select('id, name, email')
    .eq('agency_id', agencyId)
    .order('name');

  if (error) {
    return NextResponse.json({ error: 'Laden fehlgeschlagen' }, { status: 500 });
  }

  return NextResponse.json(members ?? []);
}
