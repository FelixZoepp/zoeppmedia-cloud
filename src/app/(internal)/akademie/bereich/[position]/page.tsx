import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, BookOpen, CheckCircle2, PlayCircle, Video } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeFortschritt, ladeSichtbareArtikel, ladeVideos, type Artikel } from '@/lib/akademie/daten';
import { ladeZugriff } from '@/lib/akademie/zugriff';
import { POSITIONEN } from '@/lib/akademie/positionen';
import { fortschrittVon, lernpfadFuer } from '@/lib/akademie/lernpfade';
import { WISSENSCHECKS } from '@/lib/akademie/wissenscheck';
import { Badge, Card } from '@/components/ui';
import { Wissenscheck } from './wissenscheck';
import { BereichFreigeben } from './bereich-freigeben';

const TYP_LABEL: Record<string, string> = { sop: 'SOP', skript: 'Skript', wissen: 'Wissen', faq: 'FAQ', rolle: 'Rolle' };

/** Eigene Akademie je Bereich/Position: Lernpfad, Wissen, Wissenscheck – nur bei Freischaltung */
export default async function BereichsAkademiePage({ params }: { params: Promise<{ position: string }> }) {
  const { position } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const bereich = POSITIONEN.find((p) => p.id === position);
  if (!bereich) notFound();
  const svc = createAdminClient();
  const z = await ladeZugriff(svc, { id: user.id, role: user.role, funktion: user.funktion ?? null });
  if (!z.admin && !z.positionen.has(position)) notFound();

  const [artikel, fortschritt, videos] = await Promise.all([ladeSichtbareArtikel(svc, z), ladeFortschritt(svc, user.id), ladeVideos(svc)]);
  const videoMap = new Map(videos.map((v) => [v.key, v]));
  const { stufen, weiteres } = lernpfadFuer(position, artikel);
  const pfadSlugs = stufen.flatMap((s) => s.artikel.map((a) => a.slug));
  const f = fortschrittVon(pfadSlugs, fortschritt);
  const entwuerfe = z.admin ? artikel.filter((a) => a.positionen.includes(position) && a.status === 'entwurf').length : 0;

  const Zeile = ({ a }: { a: Artikel }) => {
    const v = a.video_key ? videoMap.get(a.video_key) : null;
    const gelesen = fortschritt[a.slug]?.gelesen;
    return (
      <li>
        <Link href={`/akademie/${a.slug}`} className="flex items-start gap-3 py-2.5 hover:bg-panel/60">
          <span className="mt-0.5 flex-none text-gray-400">{gelesen ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <BookOpen className="h-5 w-5" />}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-[15px] font-medium">{a.titel}</span>
              <Badge tone="neutral">{TYP_LABEL[a.typ] ?? a.typ}</Badge>
              {z.admin && a.status === 'entwurf' && <Badge tone="warning">Entwurf</Badge>}
              {v?.video_url && <span className="inline-flex items-center gap-0.5 text-[12px] text-gray-500"><PlayCircle className="h-3.5 w-3.5" /> {v.laenge_min} Min.</span>}
              {v && !v.video_url && <span className="inline-flex items-center gap-0.5 text-[12px] text-gray-400"><Video className="h-3.5 w-3.5" /> Video folgt</span>}
            </span>
            {a.zusammenfassung && <span className="mt-0.5 block text-[13.5px] text-gray-600">{a.zusammenfassung}</span>}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/akademie" className="inline-flex items-center gap-1 text-[14px] text-gray-600 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Alle Akademien
      </Link>

      <Card className="p-5 sm:p-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-red-800">Akademie</p>
        <h1 className="mt-1 text-[24px] font-semibold leading-tight tracking-[-0.02em]">{bereich.label}</h1>
        <p className="mt-1.5 text-[15px] text-gray-700">{bereich.beschreibung}</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-panel">
          <div className="h-full rounded-full bg-gradient-to-r from-red-700 to-red-950" style={{ width: `${f.prozent}%` }} />
        </div>
        <p className="mt-1 text-[13px] text-gray-500">{f.gesamt ? `${f.gelesen} von ${f.gesamt} Themen im Lernpfad gelesen` : 'Für dich ist in diesem Bereich noch nichts freigegeben.'}</p>
        <p className="mt-3 text-[13.5px] text-gray-600">Jedes Thema hat vier Bausteine: <b>Video</b>, <b>SOP</b>, <b>Checkliste</b> zum Abarbeiten und <b>Review-Checkliste</b> danach.</p>
        {z.admin && <BereichFreigeben position={position} entwuerfe={entwuerfe} />}
      </Card>

      {stufen.map((s) => (
        <Card key={s.stufe} className="p-4">
          <h2 className="mb-1 text-[16px] font-semibold tracking-[-0.01em]">Lernpfad · {s.stufe}</h2>
          {s.artikel.length ? <ul className="divide-y divide-[var(--hair)]">{s.artikel.map((a) => <Zeile key={a.slug} a={a} />)}</ul> : <p className="text-[14px] text-gray-500">Noch keine freigegebenen Themen.</p>}
        </Card>
      ))}

      {weiteres.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-1 text-[16px] font-semibold tracking-[-0.01em]">Weiteres Wissen</h2>
          <ul className="divide-y divide-[var(--hair)]">{weiteres.map((a) => <Zeile key={a.slug} a={a} />)}</ul>
        </Card>
      )}

      {WISSENSCHECKS[position] && (
        <Card className="p-4 sm:p-5">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Wissenscheck</h2>
          <p className="mb-3 text-[13.5px] text-gray-600">Bestanden ab 80 % richtig. Dein Ergebnis sieht die Führung.</p>
          <Wissenscheck bereich={position} />
        </Card>
      )}
    </div>
  );
}
