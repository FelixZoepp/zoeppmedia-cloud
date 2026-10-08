'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckSquare, Square } from 'lucide-react';
import { Badge, Card, PageHeader } from '@/components/ui';
import { POSITION_LABEL } from '@/lib/akademie/positionen';
import { reviewVon } from '@/lib/akademie/bausteine';
import type { ArtikelTyp, SopAbschnitte } from '@/lib/akademie/inhalte';

interface Review {
  id: string;
  user_id: string;
  slug: string;
  kontext: string;
  erledigt: number[];
  notiz: string | null;
  status: 'selbstcheck' | 'zur_pruefung' | 'geprueft' | 'nacharbeit';
  pruefer_kommentar: string | null;
  updated_at: string;
}
interface Daten {
  reviews: Review[];
  wissenschecks: Array<{ user_id: string; bereich: string; richtig: number; gesamt: number; bestanden: boolean; created_at: string }>;
  hinweise: Array<{ user_id: string; slug: string; kontext: string; offene_punkte: string[]; aktion: string; created_at: string }>;
  nutzer: Array<{ id: string; name: string }>;
  artikel: Array<{ slug: string; titel: string; typ: ArtikelTyp; abschnitte: SopAbschnitte }>;
}

const STATUS: Record<Review['status'], { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  selbstcheck: { label: 'Selbstcheck', tone: 'neutral' },
  zur_pruefung: { label: 'Zur Prüfung', tone: 'warning' },
  geprueft: { label: 'Geprüft', tone: 'success' },
  nacharbeit: { label: 'Nacharbeit', tone: 'danger' },
};

const datum = (d: string) => new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

/** Admin: offene Reviews prüfen, Wissenschecks und „trotzdem erledigt“ des Teams */
export function TeamFortschritt() {
  const [d, setD] = useState<Daten | null>(null);
  const [kommentar, setKommentar] = useState<Record<string, string>>({});

  const laden = useCallback(() => {
    fetch('/api/akademie/reviews').then((r) => (r.ok ? r.json() : null)).then(setD);
  }, []);
  useEffect(laden, [laden]);

  const name = useMemo(() => new Map((d?.nutzer ?? []).map((n) => [n.id, n.name])), [d]);
  const artikel = useMemo(() => new Map((d?.artikel ?? []).map((a) => [a.slug, a])), [d]);

  // Neuestes Ergebnis je Person und Bereich
  const checks = useMemo(() => {
    const m = new Map<string, Daten['wissenschecks'][number]>();
    for (const c of d?.wissenschecks ?? []) if (!m.has(`${c.user_id}|${c.bereich}`)) m.set(`${c.user_id}|${c.bereich}`, c);
    return [...m.values()];
  }, [d]);

  async function pruefe(id: string, ergebnis: 'geprueft' | 'nacharbeit') {
    await fetch(`/api/akademie/reviews/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ergebnis, kommentar: kommentar[id] ?? null }) });
    laden();
  }

  if (!d) return <div className="p-6 text-[15px] text-gray-500">Lädt …</div>;
  const offen = d.reviews.filter((r) => r.status === 'zur_pruefung');

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/akademie" className="inline-flex items-center gap-1 text-[14px] text-gray-600 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Team-Akademie</Link>
      <PageHeader label="Akademie" title="Team-Fortschritt & Reviews" counter={`${offen.length} offen`} />

      <Card className="p-4">
        <h2 className="mb-2 text-[16px] font-semibold">Reviews zur Prüfung</h2>
        {!offen.length && <p className="text-[14px] text-gray-500">Keine offenen Reviews.</p>}
        <div className="space-y-4">
          {offen.map((r) => {
            const a = artikel.get(r.slug);
            const punkte = a ? reviewVon(a) : [];
            const set = new Set(r.erledigt);
            return (
              <div key={r.id} className="rounded-[14px] bg-panel/60 p-3">
                <div className="flex flex-wrap items-center gap-2 text-[14px]">
                  <b>{name.get(r.user_id) ?? 'Unbekannt'}</b>
                  <Link href={`/akademie/${r.slug}`} className="text-red-800 hover:underline">{a?.titel ?? r.slug}</Link>
                  {r.kontext && <span className="text-gray-500">· {r.kontext}</span>}
                  <span className="ml-auto text-[12.5px] text-gray-500">{datum(r.updated_at)}</span>
                </div>
                <ul className="mt-2 space-y-0.5 text-[13.5px]">
                  {punkte.map((p, i) => (
                    <li key={i} className="flex items-start gap-1.5">{set.has(i) ? <CheckSquare className="mt-0.5 h-4 w-4 text-green-600" /> : <Square className="mt-0.5 h-4 w-4 text-red-500" />}{p}</li>
                  ))}
                </ul>
                {r.notiz && <p className="mt-2 text-[13.5px] text-gray-700">Notiz: {r.notiz}</p>}
                <textarea value={kommentar[r.id] ?? ''} onChange={(e) => setKommentar((k) => ({ ...k, [r.id]: e.target.value }))} placeholder="Kommentar (optional)" rows={2} className="mt-2 w-full rounded-[10px] border border-[var(--hair)] bg-card px-3 py-2 text-[13.5px]" />
                <div className="mt-2 flex gap-2">
                  <button onClick={() => void pruefe(r.id, 'geprueft')} className="rounded-full bg-green-600 px-3 py-1.5 text-[13.5px] font-medium text-white">Passt</button>
                  <button onClick={() => void pruefe(r.id, 'nacharbeit')} className="rounded-full bg-white px-3 py-1.5 text-[13.5px] font-medium text-gray-700">Nacharbeit</button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-[16px] font-semibold">Wissenschecks</h2>
        {!checks.length && <p className="text-[14px] text-gray-500">Noch keine Wissenschecks.</p>}
        <ul className="divide-y divide-[var(--hair)] text-[14px]">
          {checks.map((c) => (
            <li key={`${c.user_id}|${c.bereich}`} className="flex flex-wrap items-center gap-2 py-2">
              <b>{name.get(c.user_id) ?? 'Unbekannt'}</b>
              <span>{POSITION_LABEL[c.bereich] ?? c.bereich}</span>
              <Badge tone={c.bestanden ? 'success' : 'warning'}>{c.richtig}/{c.gesamt} {c.bestanden ? 'bestanden' : 'nicht bestanden'}</Badge>
              <span className="ml-auto text-[12.5px] text-gray-500">{datum(c.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-[16px] font-semibold">Erledigt trotz offener Checkliste</h2>
        {!d.hinweise.filter((h) => h.aktion === 'trotzdem').length && <p className="text-[14px] text-gray-500">Nichts protokolliert.</p>}
        <ul className="divide-y divide-[var(--hair)] text-[14px]">
          {d.hinweise.filter((h) => h.aktion === 'trotzdem').map((h, i) => (
            <li key={i} className="py-2">
              <div className="flex flex-wrap items-center gap-2"><b>{name.get(h.user_id) ?? 'Unbekannt'}</b><span>{artikel.get(h.slug)?.titel ?? h.slug}</span><span className="ml-auto text-[12.5px] text-gray-500">{datum(h.created_at)}</span></div>
              <p className="text-[13px] text-gray-600">Offen: {h.offene_punkte.join(' · ')}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-[16px] font-semibold">Letzte Reviews</h2>
        <ul className="divide-y divide-[var(--hair)] text-[14px]">
          {d.reviews.filter((r) => r.status !== 'zur_pruefung').slice(0, 40).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
              <b>{name.get(r.user_id) ?? 'Unbekannt'}</b>
              <span>{artikel.get(r.slug)?.titel ?? r.slug}</span>
              <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              <span className="ml-auto text-[12.5px] text-gray-500">{datum(r.updated_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
