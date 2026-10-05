import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadTeamCalendar } from '@/lib/team/calendar';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Team-Kalender: Termine + offene Fristen aller Mitarbeiter im Zeitraum ?von=YYYY-MM-DD&bis=YYYY-MM-DD */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const von = req.nextUrl.searchParams.get('von') ?? '';
  const bis = req.nextUrl.searchParams.get('bis') ?? '';
  if (!DAY.test(von) || !DAY.test(bis) || von > bis) {
    return NextResponse.json({ error: 'von/bis als YYYY-MM-DD angeben' }, { status: 400 });
  }
  // Höchstens ~3 Monate auf einmal
  if (new Date(bis).getTime() - new Date(von).getTime() > 100 * 864e5) {
    return NextResponse.json({ error: 'Zeitraum zu groß' }, { status: 400 });
  }
  return NextResponse.json(await loadTeamCalendar(createAdminClient(), von, bis));
}
