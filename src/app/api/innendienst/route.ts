import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { darfKundenCloud } from '@/lib/kunden-cloud/zugriff';
import { ladeArbeit } from '@/lib/kunden-cloud/uebersicht';

/** GET /api/innendienst – alle Kunden mit offenen Bewerbern, fälligen Anrufen und ungelesenen Nachrichten */
export async function GET() {
  const user = await getCurrentUser();
  if (!darfKundenCloud(user)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  try {
    return NextResponse.json({ kunden: await ladeArbeit(createAdminClient()), stand: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}
