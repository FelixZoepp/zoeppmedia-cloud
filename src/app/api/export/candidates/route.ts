import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();

  // Agency users export their own candidates; admins export all
  let query = supabase
    .from('candidates')
    .select('name, email, phone, source, current_stage:pipeline_stages(name), created_at')
    .order('created_at', { ascending: false });

  if (user.agency_id) {
    query = query.eq('agency_id', user.agency_id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = 'Name,Email,Telefon,Quelle,Stage,Erstellt\n';
  const rows = (data ?? []).map((c) => {
    const stage = (c.current_stage as { name?: string } | null)?.name ?? '';
    const created = new Date(c.created_at as string).toLocaleDateString('de-DE');
    return [
      csvEscape(c.name as string),
      csvEscape(c.email as string ?? ''),
      csvEscape(c.phone as string ?? ''),
      csvEscape(c.source as string ?? ''),
      csvEscape(stage),
      csvEscape(created),
    ].join(',');
  });

  const csv = header + rows.join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bewerber-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
