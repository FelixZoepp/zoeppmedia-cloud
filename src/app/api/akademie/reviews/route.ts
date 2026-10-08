import { NextResponse } from 'next/server';
import { akademieKontext } from '@/lib/akademie/api';

/** GET (Admin) – Reviews, Wissenschecks und „trotzdem erledigt“-Hinweise des Teams */
export async function GET() {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const [{ data: reviews }, { data: checks }, { data: hinweise }, { data: nutzer }, { data: artikel }] = await Promise.all([
    k.svc.from('akademie_reviews').select('id, user_id, slug, kontext, erledigt, notiz, status, pruefer_kommentar, updated_at').order('updated_at', { ascending: false }).limit(200),
    k.svc.from('akademie_wissenschecks').select('user_id, bereich, richtig, gesamt, bestanden, created_at').order('created_at', { ascending: false }).limit(500),
    k.svc.from('akademie_erledigt_hinweise').select('user_id, slug, kontext, offene_punkte, aktion, created_at').order('created_at', { ascending: false }).limit(100),
    k.svc.from('users').select('id, name').in('role', ['admin', 'employee']),
    k.svc.from('akademie_artikel').select('slug, titel, typ, abschnitte'),
  ]);
  return NextResponse.json({ reviews: reviews ?? [], wissenschecks: checks ?? [], hinweise: hinweise ?? [], nutzer: nutzer ?? [], artikel: artikel ?? [] });
}
