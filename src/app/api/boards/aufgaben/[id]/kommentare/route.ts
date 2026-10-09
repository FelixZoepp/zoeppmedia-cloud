import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { ladeErlaubteAufgabe } from '@/lib/aufgaben/zugriff-aufgabe';

/** POST { text } – Kommentar an einer Aufgabe; Zuständige(r) und Ersteller werden benachrichtigt */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const text = ((await req.json().catch(() => ({}))) as { text?: string }).text?.trim();
  if (!text) return NextResponse.json({ error: 'Kommentar ist leer' }, { status: 400 });
  const svc = createAdminClient();
  const r = await ladeErlaubteAufgabe(svc, id, user);
  if ('fehler' in r) return NextResponse.json({ error: r.fehler }, { status: r.status });
  const { data, error } = await svc.from('task_comments').insert({ task_id: id, user_id: user.id, text: text.slice(0, 3000) }).select('id, user_id, text, created_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const empfaenger = [...new Set([r.aufgabe.assigned_to, r.aufgabe.created_by].filter((x): x is string => !!x && x !== user.id))];
  if (empfaenger.length) {
    const { createNotification } = await import('@/lib/notifications/create');
    for (const u of empfaenger) {
      await createNotification(svc, {
        user_id: u,
        title: `💬 ${user.name ?? 'Team'} zu „${r.aufgabe.title}“`,
        body: text.slice(0, 140),
        type: 'task_assigned',
        entity_type: 'task',
        entity_id: id,
        push_url: `/boards?aufgabe=${id}`,
      }).catch(() => {});
    }
  }
  return NextResponse.json(data);
}
