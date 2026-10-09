import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { ladeErlaubteAufgabe } from '@/lib/aufgaben/zugriff-aufgabe';

/** GET – Kommentare (Verlauf) und Checkliste einer Aufgabe */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const svc = createAdminClient();
  const r = await ladeErlaubteAufgabe(svc, id, user);
  if ('fehler' in r) return NextResponse.json({ error: r.fehler }, { status: r.status });
  const [{ data: kommentare }, { data: checkliste }] = await Promise.all([
    svc.from('task_comments').select('id, user_id, text, created_at').eq('task_id', id).order('created_at'),
    svc.from('aufgaben_checkliste').select('id, text, erledigt, position').eq('task_id', id).order('position').order('created_at'),
  ]);
  return NextResponse.json({ kommentare: kommentare ?? [], checkliste: checkliste ?? [] });
}
