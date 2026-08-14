import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();

  const agencyId = user.agency_id;
  const period = request.nextUrl.searchParams.get('period') ?? 'all';

  let fromDate: Date | null = null;
  const now = new Date();
  if (period === 'this_week') {
    fromDate = new Date(now);
    fromDate.setDate(now.getDate() - now.getDay());
    fromDate.setHours(0, 0, 0, 0);
  } else if (period === 'this_month') {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'last_month') {
    fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  }

  let candidatesQuery = supabase
    .from('candidates')
    .select('id, created_at, current_stage:pipeline_stages(name)');

  if (agencyId) candidatesQuery = candidatesQuery.eq('agency_id', agencyId);
  if (fromDate) candidatesQuery = candidatesQuery.gte('created_at', fromDate.toISOString());

  const { data: candidates } = await candidatesQuery;
  const total = candidates?.length ?? 0;
  const hired = candidates?.filter((c) => {
    const stageName = (c.current_stage as { name?: string } | null)?.name ?? '';
    return stageName.toLowerCase().includes('eingestellt') || stageName.toLowerCase().includes('hired');
  }).length ?? 0;

  let callsQuery = supabase
    .from('call_logs')
    .select('id, result, created_at');
  if (agencyId) callsQuery = callsQuery.eq('agency_id', agencyId);
  if (fromDate) callsQuery = callsQuery.gte('created_at', fromDate.toISOString());

  const { data: calls } = await callsQuery;
  const totalCalls = calls?.length ?? 0;
  const reached = calls?.filter((c) => c.result !== 'nicht_erreicht').length ?? 0;
  const withTermin = calls?.filter((c) => c.result === 'termin_vereinbart').length ?? 0;

  const periodLabel = { this_week: 'Diese Woche', this_month: 'Dieser Monat', last_month: 'Letzter Monat', all: 'Gesamt' }[period] ?? period;
  const hireRate = total > 0 ? Math.round((hired / total) * 100) : 0;
  const reachRate = totalCalls > 0 ? Math.round((reached / totalCalls) * 100) : 0;
  const terminRate = totalCalls > 0 ? Math.round((withTermin / totalCalls) * 100) : 0;

  const header = 'Zeitraum,Bewerber gesamt,Eingestellt,Einstellungsrate,Anrufe,Erreichbarkeit,Terminquote\n';
  const row = [
    csvEscape(periodLabel),
    String(total),
    String(hired),
    `${hireRate}%`,
    String(totalCalls),
    `${reachRate}%`,
    `${terminRate}%`,
  ].join(',');

  const csv = header + row;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
