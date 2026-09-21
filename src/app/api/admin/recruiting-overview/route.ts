/**
 * GET /api/admin/recruiting-overview
 *
 * Liefert die Admin-Übersicht aller Agenturen mit KPIs, Ampel und Alarmen
 * für den aktuellen Monat.
 *
 * Auth-Kette: getCurrentUser → 401; user.role !== 'admin' → 403.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgencyOverview } from '@/lib/kpi/agency-overview';

export async function GET(_req: Request) {
  // --- Auth-Kette ---
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Kein Zugriff — nur für Admins' }, { status: 403 });
  }

  // --- Datenbeschaffung ---
  const svc = createAdminClient();

  // monthStart = erster Tag des aktuellen Monats, z. B. '2026-09-01'
  const monthStart = new Date().toISOString().slice(0, 8) + '01';

  const agencies = await getAgencyOverview(svc, monthStart);

  return NextResponse.json({ agencies, month: monthStart });
}
