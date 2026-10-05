'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CheckSquare,
  MessageCircle,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Avatar, Card, PageHeader, SplitText } from '@/components/ui';
import { buttonStyles } from '@/components/ui/button';
import { helpFor, shortcutsFor, type Audience, type TopicIcon } from '@/lib/help/articles';

export interface Ansprechpartner {
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  calendly_link: string | null;
  position: string | null;
}

const ICONS: Record<TopicIcon, React.ReactNode> = {
  start: <BookOpen className="h-5 w-5" />,
  bewerber: <Users className="h-5 w-5" />,
  kampagne: <BarChart3 className="h-5 w-5" />,
  konto: <Settings className="h-5 w-5" />,
  aufgaben: <CheckSquare className="h-5 w-5" />,
  kunden: <Building2 className="h-5 w-5" />,
  kalender: <CalendarDays className="h-5 w-5" />,
  verwaltung: <ShieldCheck className="h-5 w-5" />,
};

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function HilfeClient({ audience, kontakt }: { audience: Audience; kontakt: Ansprechpartner | null }) {
  const { topics, articles } = helpFor(audience);
  const shortcuts = shortcutsFor(audience);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const [offen, setOffen] = useState<number | null>(0);

  const q = norm(query.trim());
  const treffer = articles
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => (!topic || a.topic === topic) && (!q || norm(`${a.frage} ${a.antwort}`).includes(q)));

  return (
    <div>
      <PageHeader title="Hilfe-Center" description="Antworten, Abkürzungen – und ein Mensch, wenn du einen brauchst." />

      {/* Hero */}
      <section data-rise="" className="fx-swirl rounded-2xl p-6 md:p-10">
        <SplitText as="h2" text="Wie können wir helfen?" delay={120} className="text-[clamp(30px,3.6vw,48px)] font-semibold leading-[1.08] tracking-[-0.035em]" />
        <p className="fx-fade mt-3 text-[15px] text-red-200" style={{ '--d': '200ms' } as React.CSSProperties}>
          Frage eintippen oder ein Thema wählen.
        </p>

        <div className="relative mt-6 max-w-xl">
          <Search className="pointer-events-none absolute left-[18px] top-1/2 h-5 w-5 -translate-y-1/2 text-red-950" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffen(null);
            }}
            placeholder="z. B. Logo ändern, Aufgabe verschieben …"
            aria-label="Hilfe durchsuchen"
            className="h-[52px] w-full rounded-full bg-card pl-[50px] pr-5 text-[15px] text-ink outline-none placeholder:text-gray-500 focus-visible:shadow-[0_0_0_3px_#3b0b09,0_0_0_5px_#f7c9c5]"
          />
        </div>

        <div className={`mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 ${topics.length > 4 ? 'xl:grid-cols-5' : 'lg:grid-cols-4'}`}>
          {topics.map((t) => {
            const n = articles.filter((a) => a.topic === t.key).length;
            const aktiv = topic === t.key;
            return (
              <button
                key={t.key}
                onClick={() => {
                  setTopic(aktiv ? null : t.key);
                  setOffen(null);
                }}
                aria-pressed={aktiv}
                className={`flex items-center gap-3.5 rounded-xl px-4 py-4 text-left transition-colors ${
                  aktiv ? 'bg-red-50 text-red-950' : 'bg-white/[0.07] text-red-50 shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)] hover:bg-white/[0.12]'
                }`}
              >
                <span className={aktiv ? 'text-red-800' : 'text-red-100'}>{ICONS[t.icon]}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-medium">{t.label}</span>
                  <span className={`block text-[13px] ${aktiv ? 'text-red-800' : 'text-red-200'}`}>
                    {n} {n === 1 ? 'Artikel' : 'Artikel'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* FAQ */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[22px] font-medium tracking-[-0.025em]">
              {topic ? topics.find((t) => t.key === topic)?.label : query ? 'Suchergebnisse' : 'Häufige Fragen'}
            </h2>
            {(topic || query) && (
              <button
                onClick={() => {
                  setTopic(null);
                  setQuery('');
                }}
                className="text-[14px] font-medium text-red-800 hover:underline"
              >
                Alle Fragen zeigen
              </button>
            )}
          </div>

          {treffer.length === 0 ? (
            <p className="mt-4 text-[15px] text-gray-600">Keine passende Antwort gefunden. Schreib uns – rechts steht, wie.</p>
          ) : (
            <ul className="mt-2 divide-y divide-hair">
              {treffer.map(({ a, i }) => {
                const auf = offen === i;
                return (
                  <li key={i}>
                    <button
                      onClick={() => setOffen(auf ? null : i)}
                      aria-expanded={auf}
                      className="flex w-full items-center gap-4 py-5 text-left"
                    >
                      <span className="flex-1 text-[16.5px] font-medium leading-snug">{a.frage}</span>
                      <span
                        className={`grid h-9 w-9 flex-none place-items-center rounded-full transition-[transform,background,color] duration-300 ease-fern ${
                          auf ? 'rotate-45 bg-red-950 text-red-50' : 'bg-panel text-ink'
                        }`}
                      >
                        <Plus className="h-[18px] w-[18px]" />
                      </span>
                    </button>
                    <div
                      className="grid transition-[grid-template-rows] duration-500 ease-fern"
                      style={{ gridTemplateRows: auf ? '1fr' : '0fr' }}
                    >
                      <div className="overflow-hidden">
                        <p className="pb-2 pr-12 text-[15px] leading-relaxed text-gray-700">{a.antwort}</p>
                        {a.link && (
                          <Link href={a.link.href} className="mb-5 inline-flex items-center gap-1 text-[14px] font-medium text-red-800 hover:underline">
                            {a.link.label} <ArrowUpRight className="h-4 w-4" />
                          </Link>
                        )}
                        {!a.link && <div className="pb-3" />}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="grid gap-4">
          {/* Tastenkürzel */}
          <Card className="hidden md:block">
            <h2 className="text-[22px] font-medium tracking-[-0.025em]">Tastenkürzel</h2>
            <ul className="mt-4 space-y-3">
              {shortcuts.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3">
                  <span className="flex gap-1.5">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="grid h-9 min-w-[36px] place-items-center rounded-[10px] bg-card px-2 font-sans text-[13px] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--hair),0_2px_0_var(--hair)]"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                  <span className="text-right text-[14px] text-gray-600">{s.label}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Kontakt */}
          <section data-rise="" className="fx-swirl rounded-xl p-6">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-red-50 text-red-950">
              <MessageCircle className="h-5 w-5" />
            </span>
            {audience === 'kunde' ? (
              kontakt ? (
                <>
                  <p className="mt-4 text-[22px] font-semibold leading-tight tracking-[-0.03em]">Dein Ansprechpartner</p>
                  <div className="mt-4 flex items-center gap-3">
                    <Avatar name={kontakt.name} src={kontakt.avatar_url} size={48} />
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-medium">{kontakt.name}</p>
                      <p className="truncate text-[13px] text-red-200">{kontakt.position ?? 'Zoepp Media'}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-2.5">
                    <a href={`mailto:${kontakt.email}`} className={buttonStyles('secondary', 'md', 'w-full')}>
                      E-Mail schreiben
                    </a>
                    {kontakt.calendly_link && (
                      <a href={kontakt.calendly_link} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 w-full items-center justify-center rounded-full bg-red-800 text-[15px] font-medium text-red-50 hover:bg-red-700">
                        Termin buchen
                      </a>
                    )}
                    {kontakt.phone && (
                      <a href={`tel:${kontakt.phone}`} className="text-center text-[14px] text-red-100 hover:underline">
                        {kontakt.phone}
                      </a>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-4 text-[22px] font-semibold leading-tight tracking-[-0.03em]">Noch Fragen?</p>
                  <p className="mt-2 text-[14px] text-red-200">Schreib uns direkt über den Projektstatus – wir melden uns schnellstmöglich.</p>
                  <Link href="/status" className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-red-800 text-[15px] font-medium text-red-50 hover:bg-red-700">
                    Nachricht schreiben
                  </Link>
                </>
              )
            ) : (
              <>
                <p className="mt-4 text-[22px] font-semibold leading-tight tracking-[-0.03em]">Wie machen wir das?</p>
                <p className="mt-2 text-[14px] text-red-200">Abläufe, Vorlagen und Handlungsanweisungen stehen im Playbook.</p>
                <Link href="/playbook" className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-red-800 text-[15px] font-medium text-red-50 hover:bg-red-700">
                  Playbook öffnen
                </Link>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
