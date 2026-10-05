'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Clock, Download, FileText, GraduationCap, Link2, ListOrdered, Paperclip, PlayCircle } from 'lucide-react';
import { Card, SplitText } from '@/components/ui';
import { formatZeit, videoEmbedUrl, type Lesson, type Module } from '@/lib/masterclass/lesson';

interface Detail {
  lesson: Lesson;
  module: Module | null;
  modul_lektionen: Array<{ id: string; title: string; typ: string; duration_minutes: number | null; erledigt: boolean }>;
  vorher: { id: string; title: string } | null;
  nachher: { id: string; title: string } | null;
  erledigt: boolean;
  aufgaben: Array<{ id: string; title: string; description: string | null; erledigt: boolean }>;
  kann_fortschritt_speichern: boolean;
}

async function saveProgress(type: 'lesson' | 'task', id: string, value: boolean) {
  const res = await fetch('/api/masterclass/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id, value }),
  });
  if (!res.ok) throw new Error('Fortschritt konnte nicht gespeichert werden');
}

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [start, setStart] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/masterclass/lessons/${id}`).then(async (r) => {
      if (cancelled) return;
      if (!r.ok) {
        toast.error('Lektion nicht gefunden');
        router.push('/masterclass');
        return;
      }
      setD(await r.json());
    });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  // „Kein vorzeitiges Abschließen“: Knopf erst nach der Videodauer freigeben
  const sperrSek = d?.lesson.kein_vorzeitiges_abschliessen && d.lesson.duration_minutes ? d.lesson.duration_minutes * 60 : 0;
  const rest = Math.max(0, Math.ceil(sperrSek - (now - startedAt) / 1000));
  useEffect(() => {
    if (!sperrSek || rest <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sperrSek, rest]);

  const embed = useMemo(() => (d ? videoEmbedUrl(d.lesson.video_url, start) : null), [d, start]);

  if (!d) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
      </div>
    );
  }
  const l = d.lesson;

  async function toggleDone() {
    if (!d) return;
    const next = !d.erledigt;
    setD({ ...d, erledigt: next, modul_lektionen: d.modul_lektionen.map((x) => (x.id === l.id ? { ...x, erledigt: next } : x)) });
    try {
      await saveProgress('lesson', l.id, next);
      if (next) {
        toast.success('Lektion erledigt');
        if (d.nachher) setTimeout(() => router.push(`/masterclass/lektion/${d.nachher!.id}`), 600);
      }
    } catch (e) {
      setD(d);
      toast.error(e instanceof Error ? e.message : 'Fehler');
    }
  }

  async function toggleTask(taskId: string, value: boolean) {
    if (!d) return;
    setD({ ...d, aufgaben: d.aufgaben.map((t) => (t.id === taskId ? { ...t, erledigt: value } : t)) });
    try {
      await saveProgress('task', taskId, value);
    } catch {
      toast.error('Konnte nicht gespeichert werden');
    }
  }

  return (
    <div>
      <nav className="fx-fade mb-3 flex flex-wrap items-center gap-2 text-[14px] text-gray-600">
        <GraduationCap className="h-4 w-4" />
        <Link href="/masterclass" className="hover:text-ink">Masterclass</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="max-w-[240px] truncate">{d.module?.title}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/masterclass" className="grid h-11 w-11 place-items-center rounded-full hover:bg-gray-100" aria-label="Zur Übersicht">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <SplitText as="h1" text={l.title} className="min-w-0 flex-1 text-[clamp(26px,2.8vw,38px)] font-semibold leading-tight tracking-[-0.035em]" />
        <div className="flex gap-2">
          <NavBtn href={d.vorher ? `/masterclass/lektion/${d.vorher.id}` : null} label={d.vorher ? `Vorherige: ${d.vorher.title}` : 'Vorherige'}>
            <ChevronLeft className="h-5 w-5" />
          </NavBtn>
          <NavBtn href={d.nachher ? `/masterclass/lektion/${d.nachher.id}` : null} label={d.nachher ? `Nächste: ${d.nachher.title}` : 'Nächste'}>
            <ChevronRight className="h-5 w-5" />
          </NavBtn>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {l.typ === 'video' && (
            <Card padding="none" className="overflow-hidden">
              {embed ? (
                <div className="aspect-video bg-ink">
                  <iframe key={embed} src={embed} title={l.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="h-full w-full" />
                </div>
              ) : (
                <div className="grid aspect-video place-items-center bg-panel text-gray-500">
                  <PlayCircle className="h-10 w-10" />
                </div>
              )}
            </Card>
          )}

          {/* Handy/Tablet: Abschließen direkt unter dem Video */}
          <button
            onClick={toggleDone}
            disabled={!d.kann_fortschritt_speichern || (!d.erledigt && rest > 0)}
            className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold disabled:opacity-50 xl:hidden ${
              d.erledigt ? 'bg-green-50 text-green-800 shadow-[inset_0_0_0_1.5px_#bbf7d0]' : 'bg-gradient-to-b from-red-700 to-red-950 text-red-50'
            }`}
          >
            <Check className="h-5 w-5" />
            {d.erledigt ? 'Erledigt' : rest > 0 ? `Noch ${formatZeit(rest)}` : 'Als erledigt markieren'}
          </button>

          {(l.description || l.content_html) && (
            <Card>
              {l.description && <p className="text-[16px] leading-relaxed text-gray-700">{l.description}</p>}
              {l.content_html && (
                <div
                  className={`lesson-content text-[15.5px] leading-relaxed ${l.description ? 'mt-4 border-t border-hair pt-4' : ''}`}
                  // Inhalt wird beim Speichern serverseitig gefiltert (sanitizeLessonHtml)
                  dangerouslySetInnerHTML={{ __html: l.content_html }}
                />
              )}
              {l.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {l.tags.map((t) => (
                    <span key={t} className="rounded-full bg-panel px-2.5 py-1 text-[12.5px] text-gray-700">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}

          {d.aufgaben.length > 0 && (
            <Card>
              <h2 className="text-[19px] font-medium tracking-[-0.02em]">Umsetzen</h2>
              <ul className="mt-3 space-y-2">
                {d.aufgaben.map((t) => (
                  <li key={t.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-[14px] bg-panel px-4 py-3">
                      <input
                        type="checkbox"
                        checked={t.erledigt}
                        disabled={!d.kann_fortschritt_speichern}
                        onChange={(e) => toggleTask(t.id, e.target.checked)}
                        className="mt-0.5 h-5 w-5 flex-none accent-red-800"
                      />
                      <span>
                        <span className={`block text-[15px] ${t.erledigt ? 'text-gray-500 line-through' : ''}`}>{t.title}</span>
                        {t.description && <span className="block text-[13px] text-gray-600">{t.description}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {/* Abschließen */}
          <Card hero={d.erledigt} className={d.erledigt ? '' : ''}>
            <p className={`text-[13px] font-medium uppercase tracking-[0.06em] ${d.erledigt ? 'text-red-200' : 'text-gray-500'}`}>
              {d.erledigt ? 'Erledigt' : l.pflicht ? 'Pflicht-Lektion' : 'Lektion'}
            </p>
            {l.duration_minutes ? (
              <p className={`mt-1 inline-flex items-center gap-1.5 text-[14px] ${d.erledigt ? 'text-red-100' : 'text-gray-600'}`}>
                <Clock className="h-4 w-4" /> {l.duration_minutes} Minuten
              </p>
            ) : null}
            <button
              onClick={toggleDone}
              disabled={!d.kann_fortschritt_speichern || (!d.erledigt && rest > 0)}
              className={`mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-colors disabled:opacity-50 ${
                d.erledigt ? 'bg-red-50 text-red-950 hover:bg-white' : 'bg-gradient-to-b from-red-700 to-red-950 text-red-50 hover:from-red-600 hover:to-red-800'
              }`}
            >
              <Check className="h-5 w-5" />
              {d.erledigt ? 'Als offen markieren' : rest > 0 ? `Noch ${formatZeit(rest)}` : 'Als erledigt markieren'}
            </button>
            {!d.kann_fortschritt_speichern && <p className="mt-2 text-[12.5px] text-gray-500">Fortschritt wird nur für Kunden-Konten gespeichert.</p>}
          </Card>

          {l.kapitel.length > 0 && (
            <Card>
              <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
                <ListOrdered className="h-5 w-5 text-red-800" /> Kapitel
              </h2>
              <ul className="mt-3 space-y-1">
                {l.kapitel.map((k, i) => (
                  <li key={i}>
                    <button onClick={() => setStart(k.sekunden)} className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left hover:bg-panel">
                      <span className="w-14 flex-none font-mono text-[13.5px] font-medium text-red-800">{formatZeit(k.sekunden)}</span>
                      <span className="text-[14.5px]">{k.titel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {l.anhaenge.length > 0 && (
            <Card>
              <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
                <Paperclip className="h-5 w-5 text-red-800" /> Material
              </h2>
              <ul className="mt-3 space-y-1.5">
                {l.anhaenge.map((a, i) => (
                  <li key={i}>
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-[12px] bg-panel px-3 py-2.5 text-[14.5px] hover:bg-red-50">
                      {a.art === 'link' ? <Link2 className="h-4 w-4 flex-none text-gray-600" /> : <Download className="h-4 w-4 flex-none text-gray-600" />}
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h2 className="text-[19px] font-medium tracking-[-0.02em]">{d.module?.title ?? 'Modul'}</h2>
            <ul className="mt-3 space-y-1">
              {d.modul_lektionen.map((x) => (
                <li key={x.id}>
                  <Link
                    href={`/masterclass/lektion/${x.id}`}
                    className={`flex items-center gap-3 rounded-[12px] px-2 py-2 ${x.id === l.id ? 'bg-red-50 text-red-900' : 'hover:bg-panel'}`}
                  >
                    <span className={`grid h-6 w-6 flex-none place-items-center rounded-full ${x.erledigt ? 'bg-green-600 text-white' : 'shadow-[inset_0_0_0_1.5px_var(--hair)]'}`}>
                      {x.erledigt && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14.5px]">{x.title}</span>
                    {x.typ === 'text' ? <FileText className="h-4 w-4 flex-none text-gray-400" /> : x.duration_minutes ? <span className="text-xs text-gray-500">{x.duration_minutes}′</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function NavBtn({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  return href ? (
    <Link href={href} title={label} aria-label={label} className="grid h-11 w-11 place-items-center rounded-full hover:bg-gray-100">
      {children}
    </Link>
  ) : (
    <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full opacity-30">
      {children}
    </span>
  );
}
