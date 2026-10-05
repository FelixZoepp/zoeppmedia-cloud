'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Clock, FileText, PlayCircle } from 'lucide-react';
import { Card, CountUp, PageHeader, SplitText } from '@/components/ui';
import type { Lesson, Module } from '@/lib/masterclass/lesson';

interface Data {
  modules: Module[];
  lessons: Lesson[];
  lessonProgress: Record<string, boolean>;
}

export default function MasterclassPage() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/masterclass')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setData(d ?? { modules: [], lessons: [], lessonProgress: {} }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
      </div>
    );
  }

  const modules = [...data.modules].sort((a, b) => a.sort_order - b.sort_order);
  const byModule = (id: string) => data.lessons.filter((l) => l.module_id === id).sort((a, b) => a.sort_order - b.sort_order);
  const alle = modules.flatMap((m) => byModule(m.id));
  const fertig = alle.filter((l) => data.lessonProgress[l.id]).length;
  const prozent = alle.length ? Math.round((fertig / alle.length) * 100) : 0;
  const weiter = alle.find((l) => !data.lessonProgress[l.id]) ?? null;
  const pflichtOffen = alle.filter((l) => l.pflicht && !data.lessonProgress[l.id]).length;

  return (
    <div>
      <PageHeader title="Masterclass" description="Schritt für Schritt zu planbarem Recruiting und starkem Vertrieb." />

      {/* Fortschritt */}
      <section data-rise="" className="fx-swirl mb-4 grid gap-6 rounded-2xl p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-9">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-red-200">Dein Fortschritt</p>
          <SplitText
            as="h2"
            text={prozent === 100 ? 'Alles geschafft – stark!' : weiter ? 'Weiter geht’s' : 'Los geht’s'}
            delay={100}
            className="mt-1 text-[clamp(28px,3vw,40px)] font-semibold leading-tight tracking-[-0.035em]"
          />
          <p className="mt-2 text-[15px] text-red-200">
            {fertig} von {alle.length} Lektionen erledigt
            {pflichtOffen > 0 ? ` · ${pflichtOffen} Pflicht-Lektion${pflichtOffen === 1 ? '' : 'en'} offen` : ''}
          </p>
          <div className="mt-4 h-2.5 max-w-md overflow-hidden rounded-full bg-white/15">
            <div className="h-full origin-left rounded-full bg-red-50" style={{ width: `${prozent}%`, animation: 'fx-bar 1.1s cubic-bezier(.33,1,.68,1) .2s both' }} />
          </div>
          {weiter && (
            <Link
              href={`/masterclass/lektion/${weiter.id}`}
              className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-red-50 px-6 text-[15px] font-semibold text-red-950 transition-transform hover:-translate-y-0.5"
            >
              <PlayCircle className="h-5 w-5" /> {fertig ? 'Weiter mit' : 'Starten mit'}: {weiter.title}
            </Link>
          )}
        </div>
        <div className="hidden text-right md:block">
          <p className="text-[64px] font-semibold leading-none tracking-[-0.05em]">
            <CountUp value={prozent} suffix="%" />
          </p>
        </div>
      </section>

      {modules.length === 0 ? (
        <Card className="py-14 text-center">
          <p className="text-[17px] font-medium">Die Masterclass wird gerade vorbereitet</p>
          <p className="mt-1 text-sm text-gray-600">Sobald die ersten Lektionen online sind, findest du sie hier.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {modules.map((m, mi) => {
            const list = byModule(m.id);
            const done = list.filter((l) => data.lessonProgress[l.id]).length;
            return (
              <Card key={m.id} padding="none" className="overflow-hidden">
                <header className="flex items-center gap-4 px-5 py-4 md:px-6">
                  <span
                    className={`grid h-11 w-11 flex-none place-items-center rounded-full text-[15px] font-semibold ${
                      list.length && done === list.length ? 'bg-green-50 text-green-700' : 'bg-red-100 text-red-900'
                    }`}
                  >
                    {list.length && done === list.length ? <Check className="h-5 w-5" /> : mi + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[19px] font-medium tracking-[-0.02em]">{m.title}</h2>
                    {m.description && <p className="text-[13.5px] text-gray-600">{m.description}</p>}
                  </div>
                  <span className="flex-none text-[13.5px] text-gray-600">
                    {done}/{list.length}
                  </span>
                </header>
                <ul className="border-t border-hair">
                  {list.map((l) => {
                    const ok = !!data.lessonProgress[l.id];
                    return (
                      <li key={l.id} className="border-b border-hair last:border-0">
                        <Link href={`/masterclass/lektion/${l.id}`} className="flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-panel/70 md:px-6">
                          {l.thumbnail_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- Vorschaubild aus dem Storage
                            <img src={l.thumbnail_url} alt="" className="h-12 w-20 flex-none rounded-[10px] object-cover" />
                          ) : (
                            <span className="grid h-12 w-20 flex-none place-items-center rounded-[10px] bg-panel text-gray-500">
                              {l.typ === 'text' ? <FileText className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[15px] font-medium ${ok ? 'text-gray-600' : ''}`}>{l.title}</span>
                            <span className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-gray-600">
                              {l.duration_minutes ? (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> {l.duration_minutes} Min.
                                </span>
                              ) : null}
                              {l.pflicht && <span className="font-medium text-red-800">Pflicht</span>}
                              {l.description && <span className="hidden truncate sm:inline">{l.description}</span>}
                            </span>
                          </span>
                          <span
                            className={`grid h-8 w-8 flex-none place-items-center rounded-full ${ok ? 'bg-green-600 text-white' : 'shadow-[inset_0_0_0_1.5px_var(--hair)] text-transparent'}`}
                            aria-label={ok ? 'Erledigt' : 'Offen'}
                          >
                            {ok && <Check className="h-4 w-4" />}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
