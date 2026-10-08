import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeArtikel, ladeFortschritt, ladeVideos } from '@/lib/akademie/daten';
import { ladeZugriff } from '@/lib/akademie/zugriff';
import { POSITION_LABEL } from '@/lib/akademie/positionen';
import { videoEmbedUrl } from '@/lib/masterclass/lesson';
import { Badge, Card } from '@/components/ui';
import { Markdown } from '@/components/akademie/markdown';
import { ArtikelAktionen } from './artikel-aktionen';

const TYP_LABEL: Record<string, string> = { sop: 'SOP', skript: 'Skript', wissen: 'Wissen', faq: 'FAQ', rolle: 'Rolle' };

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-gray-500">{titel}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

const Liste = ({ items, nummeriert = false }: { items: string[]; nummeriert?: boolean }) => {
  const T = nummeriert ? 'ol' : 'ul';
  return <T className={`${nummeriert ? 'list-decimal' : 'list-disc'} space-y-1 pl-5 text-[15px]`}>{items.map((x, i) => <li key={i}>{x}</li>)}</T>;
};

export default async function AkademieArtikelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const svc = createAdminClient();
  const z = await ladeZugriff(svc, { id: user.id, role: user.role, funktion: user.funktion ?? null });
  const a = await ladeArtikel(svc, slug, z);
  if (!a) notFound();

  const [videos, fortschritt] = await Promise.all([ladeVideos(svc), ladeFortschritt(svc, user.id)]);
  const video = a.video_key ? videos.find((v) => v.key === a.video_key) ?? null : null;
  const embed = video?.video_url ? videoEmbedUrl(video.video_url) : null;
  const ab = a.abschnitte ?? {};
  const f = fortschritt[a.slug] ?? { gelesen: false, video: false };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/akademie" className="inline-flex items-center gap-1 text-[14px] text-gray-600 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Team-Akademie
      </Link>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{TYP_LABEL[a.typ] ?? a.typ}</Badge>
          <Badge tone="outline">{a.modul}</Badge>
          {a.positionen.map((p) => <Badge key={p} tone="softAccent">{POSITION_LABEL[p] ?? p}</Badge>)}
          {a.status === 'entwurf' && <Badge tone="warning">Entwurf – für Mitarbeiter unsichtbar</Badge>}
        </div>
        <h1 className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.02em]">{a.titel}</h1>
        {a.zusammenfassung && <p className="mt-2 text-[15.5px] text-gray-700">{a.zusammenfassung}</p>}

        {video && (
          <div className="mt-5">
            {embed ? (
              <div className="relative aspect-video overflow-hidden rounded-[14px] bg-black">
                <iframe src={embed} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={video.titel} />
              </div>
            ) : (
              <div className="rounded-[14px] bg-panel px-4 py-3 text-[14px] text-gray-600">
                Video „{video.titel}“ ({video.laenge_min} Min.) {video.status === 'aufnahme_noetig' ? 'wird noch aufgenommen.' : 'ist noch nicht verlinkt.'}
              </div>
            )}
          </div>
        )}

        {ab.zweck && <Abschnitt titel="Wozu"><p className="text-[15px]">{ab.zweck}</p></Abschnitt>}
        {ab.ausloeser && <Abschnitt titel="Wann"><p className="text-[15px]">{ab.ausloeser}</p></Abschnitt>}
        {!!ab.automatisch?.length && (
          <Abschnitt titel="Das macht die Cloud/KI automatisch">
            <div className="rounded-[12px] bg-green-50 px-3 py-2 text-green-900"><Liste items={ab.automatisch} /></div>
          </Abschnitt>
        )}
        {!!ab.schritte?.length && <Abschnitt titel="Das machst du"><Liste items={ab.schritte} nummeriert /></Abschnitt>}
        {!!ab.qualitaet?.length && <Abschnitt titel="Qualitätscheck"><Liste items={ab.qualitaet} /></Abschnitt>}
        {!!ab.fehler?.length && <Abschnitt titel="Häufige Fehler"><Liste items={ab.fehler} /></Abschnitt>}
        {a.inhalt && <div className="mt-4"><Markdown text={a.inhalt} /></div>}
        {!!ab.links?.length && (
          <Abschnitt titel="In der Cloud">
            <div className="flex flex-wrap gap-2">
              {ab.links.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-full bg-panel px-3 py-1 text-[14px] text-gray-700 hover:text-red-800">{l.label} →</Link>
              ))}
            </div>
          </Abschnitt>
        )}
        {a.quelle && z.admin && <p className="mt-6 text-[12.5px] text-gray-400">Quelle: {a.quelle}</p>}

        <ArtikelAktionen slug={a.slug} gelesen={f.gelesen} videoGesehen={f.video} hatVideo={!!embed} admin={z.admin} />
      </Card>
    </div>
  );
}
