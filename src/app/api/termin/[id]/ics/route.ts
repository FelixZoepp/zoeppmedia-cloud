import { NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { erfasseTerminAktion } from '@/lib/sales/termin-tracking';
import { icsDatei } from '@/lib/sales/termin-kalender';
import { ladeSalesTermin } from '@/lib/sales/termin-laden';

/** .ics-Datei eines Sales-Termins (Apple Kalender, Outlook-Desktop, alle anderen) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await ladeSalesTermin(id);
  if (!t) return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 });
  const ua = req.headers.get('user-agent');
  after(() => erfasseTerminAktion(createAdminClient(), id, 'apple', ua));
  return new NextResponse(icsDatei(t), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="termin-zoepp-media.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
