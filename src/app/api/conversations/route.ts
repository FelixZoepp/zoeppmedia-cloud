import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  // R7: return 403 instead of empty array
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const filter = request.nextUrl.searchParams.get('filter') || 'all';
  const search = request.nextUrl.searchParams.get('search') || '';

  const svc = createAdminClient();
  let query = svc
    .from('conversations')
    .select(`
      id, state, window_expires_at, unread_count, last_message_at, assigned_to,
      candidate:candidates!inner(id, name, phone_e164, email, source, consent_source, created_at, location, current_stage:pipeline_stages(name, color)),
      application:applications(id, job:jobs(title), stage:pipeline_stages(name, color))
    `)
    .eq('agency_id', agencyId)
    .order('last_message_at', { ascending: false });

  // Filter
  switch (filter) {
    case 'mine':
      query = query.eq('assigned_to', user.id);
      break;
    case 'unassigned':
      query = query.is('assigned_to', null);
      break;
    case 'unread':
      query = query.gt('unread_count', 0);
      break;
    case 'expiring': {
      const twoHours = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      query = query.lt('window_expires_at', twoHours).gt('window_expires_at', new Date().toISOString());
      break;
    }
  }

  // Suche — zwei Schritte, da PostgREST kein .or() auf joined columns unterstützt (I-2).
  // Kommas im Suchbegriff werden entfernt um .or()-Syntax nicht zu brechen.
  if (search) {
    const s = search.replace(/,/g, '');
    const { data: matchingCandidates } = await svc
      .from('candidates')
      .select('id')
      .eq('agency_id', agencyId)
      .or(`name.ilike.%${s}%,phone_e164.ilike.%${s}%,email.ilike.%${s}%`);

    const ids = (matchingCandidates ?? []).map((c: { id: string }) => c.id);
    if (ids.length === 0) return NextResponse.json([]);

    query = query.in('candidate_id', ids);
  }

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Array<Record<string, unknown> & { id: string }>;

  // Vorschau: letzte Nachricht je Konversation (neueste zuerst, eine Abfrage)
  const last = new Map<string, Record<string, unknown>>();
  if (rows.length) {
    const { data: msgs } = await svc
      .from('messages')
      .select('conversation_id, body, type, direction, sender_type, created_at')
      .in('conversation_id', rows.map((r) => r.id))
      .order('created_at', { ascending: false })
      .limit(Math.min(1000, rows.length * 10));
    for (const m of (msgs ?? []) as Array<Record<string, unknown> & { conversation_id: string }>) {
      if (!last.has(m.conversation_id)) last.set(m.conversation_id, m);
    }
  }

  const res = NextResponse.json(rows.map((r) => ({ ...r, last_message: last.get(r.id) ?? null })));
  // Sales-Inbox (interne Agentur) zeigt Leads statt Bewerber
  res.headers.set('x-inbox-kind', agencyId === SALES_AGENCY_ID ? 'sales' : 'recruiting');
  return res;
}
