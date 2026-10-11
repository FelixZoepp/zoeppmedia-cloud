import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { briefingInhalt, erstelleBriefing, type BriefingDaten } from '@/lib/berichte/ceo-briefing';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** CEO-Briefing: zuletzt verschickte Ausgaben, mit ?live=1 eine frische Berechnung (ohne Versand) */
export default async function BriefingPage({ searchParams }: { searchParams: Promise<{ tag?: string; live?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');
  const { tag, live } = await searchParams;
  const svc = createAdminClient();

  const { data: liste } = await svc.from('ceo_briefings').select('tag').order('tag', { ascending: false }).limit(10);
  const tage = ((liste ?? []) as Array<{ tag: string }>).map((x) => x.tag);

  let daten: BriefingDaten | null = null;
  let fehler: string | null = null;
  if (live) {
    try {
      daten = await erstelleBriefing(svc);
    } catch (e) {
      fehler = e instanceof Error ? e.message : 'Briefing konnte nicht berechnet werden';
    }
  } else {
    const gewaehlt = tag && /^\d{4}-\d{2}-\d{2}$/.test(tag) ? tag : tage[0];
    if (gewaehlt) {
      const { data } = await svc.from('ceo_briefings').select('daten').eq('tag', gewaehlt).maybeSingle();
      daten = ((data as { daten: BriefingDaten } | null)?.daten ?? null) as BriefingDaten | null;
    }
  }

  const chip = (aktiv: boolean) => `rounded-full px-3 py-1.5 text-xs font-semibold ${aktiv ? 'bg-red-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/briefing?live=1" className={chip(!!live)}>
          🔄 Jetzt berechnen
        </Link>
        {tage.map((t) => (
          <Link key={t} href={`/admin/briefing?tag=${t}`} className={chip(!live && (tag ?? tage[0]) === t)}>
            {new Date(`${t}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' })}
          </Link>
        ))}
      </div>
      {fehler && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{fehler}</div>}
      {daten ? (
        <div className="-mx-4 rounded-2xl bg-[#f5f4f2] sm:mx-0" dangerouslySetInnerHTML={{ __html: briefingInhalt(daten) }} />
      ) : (
        !fehler && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
            Noch kein Briefing verschickt. Es kommt Mo–Fr ab 7 Uhr per Mail und Push. Mit „Jetzt berechnen“ siehst du es sofort.
          </div>
        )
      )}
    </div>
  );
}
