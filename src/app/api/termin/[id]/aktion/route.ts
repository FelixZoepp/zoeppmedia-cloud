import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { erfasseTerminAktion } from '@/lib/sales/termin-tracking';

/** POST { aktion: 'video' } – Ablauf-Video auf der Terminseite gestartet */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { aktion?: string };
  if (body.aktion !== 'video' || !/^[A-Za-z0-9_-]{6,80}$/.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  const ua = req.headers.get('user-agent');
  after(() => erfasseTerminAktion(createAdminClient(), id, 'video', ua));
  return NextResponse.json({ ok: true });
}
