import { NextRequest, NextResponse, after } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { fehler } from '@/lib/akademie/api';
import { verarbeiteAufnahme } from '@/lib/akademie/aufnahme';

export const maxDuration = 300;

/**
 * POST – (erneut) verarbeiten. Admin per Knopf (erzwingt auch bei „fertig“/„fehler“) oder der Tick
 * mit CRON_SECRET (nur Wartendes/Hängengebliebenes). Antwortet sofort, gearbeitet wird per after().
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cron = !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  let erzwingen = false;
  if (!cron) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') return fehler('Nur für Admins', 403);
    erzwingen = true;
  }
  const svc = createAdminClient();
  if (erzwingen) {
    // Bei erneutem Verarbeiten neu transkribieren lassen, falls das Transkript der Fehler war
    const body = (await req.json().catch(() => ({}))) as { neuTranskribieren?: boolean };
    if (body.neuTranskribieren) await svc.from('akademie_aufnahmen').update({ transkript: null }).eq('id', id);
  }
  after(() => verarbeiteAufnahme(svc, id, { erzwingen }).then(() => undefined).catch((err) => console.error('[akademie] Aufnahme', id, err)));
  return NextResponse.json({ ok: true }, { status: 202 });
}
