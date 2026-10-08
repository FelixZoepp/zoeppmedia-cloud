'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, Input } from '@/components/ui';
import type { Artikel } from '@/lib/akademie/daten';

const zeilen = (xs: string[] | undefined) => (xs ?? []).join('\n');
const liste = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const feld = 'w-full rounded-[12px] bg-card p-2.5 text-[14.5px] shadow-[inset_0_0_0_1.5px_var(--hair)]';

export function ArtikelEditor({ artikel, videos, positionen }: { artikel: Artikel; videos: Array<{ key: string; titel: string }>; positionen: Array<{ id: string; label: string }> }) {
  const ab = artikel.abschnitte ?? {};
  const [f, setF] = useState({
    titel: artikel.titel,
    modul: artikel.modul,
    status: artikel.status,
    zusammenfassung: artikel.zusammenfassung ?? '',
    positionen: artikel.positionen,
    step_keys: artikel.step_keys.join(', '),
    video_key: artikel.video_key ?? '',
    prioritaet: artikel.prioritaet,
    zweck: ab.zweck ?? '',
    ausloeser: ab.ausloeser ?? '',
    automatisch: zeilen(ab.automatisch),
    schritte: zeilen(ab.schritte),
    qualitaet: zeilen(ab.qualitaet),
    fehler: zeilen(ab.fehler),
    links: (ab.links ?? []).map((l) => `${l.label} | ${l.href}`).join('\n'),
    inhalt: artikel.inhalt ?? '',
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  async function speichern() {
    setSpeichert(true);
    setMsg(null);
    const body = {
      titel: f.titel,
      modul: f.modul,
      status: f.status,
      zusammenfassung: f.zusammenfassung,
      positionen: f.positionen,
      step_keys: f.step_keys.split(',').map((s) => s.trim()).filter(Boolean),
      video_key: f.video_key || null,
      prioritaet: f.prioritaet,
      inhalt: f.inhalt.trim() ? f.inhalt : null,
      abschnitte: {
        ...(f.zweck ? { zweck: f.zweck } : {}),
        ...(f.ausloeser ? { ausloeser: f.ausloeser } : {}),
        automatisch: liste(f.automatisch),
        schritte: liste(f.schritte),
        qualitaet: liste(f.qualitaet),
        fehler: liste(f.fehler),
        links: liste(f.links)
          .map((z) => z.split('|').map((x) => x.trim()))
          .filter(([, href]) => href?.startsWith('/'))
          .map(([label, href]) => ({ label, href })),
      },
    };
    const res = await fetch(`/api/akademie/artikel/${artikel.slug}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? 'Gespeichert' : (d as { error?: string }).error ?? 'Fehler');
    setSpeichert(false);
  }

  const t = (k: keyof typeof f, label: string, rows = 4, hilfe?: string) => (
    <label className="block">
      <span className="text-[13px] font-medium text-gray-600">{label}</span>
      {hilfe && <span className="ml-1 text-[12px] text-gray-400">{hilfe}</span>}
      <textarea value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} rows={rows} className={`mt-1 ${feld}`} />
    </label>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/admin/akademie" className="inline-flex items-center gap-1 text-[14px] text-gray-600 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Verwaltung</Link>
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-[20px] font-semibold">Artikel bearbeiten</h1>
          <Link href={`/akademie/${artikel.slug}`} className="text-[14px] text-red-800 hover:underline">Ansehen →</Link>
        </div>
        <Input value={f.titel} onChange={(e) => setF({ ...f, titel: e.target.value })} placeholder="Titel" />
        <div className="grid gap-2 sm:grid-cols-3">
          <Input value={f.modul} onChange={(e) => setF({ ...f, modul: e.target.value })} placeholder="Modul" />
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as typeof f.status })} className={`h-11 ${feld}`}>
            <option value="entwurf">Entwurf (unsichtbar)</option>
            <option value="freigegeben">Freigegeben</option>
          </select>
          <select value={f.video_key} onChange={(e) => setF({ ...f, video_key: e.target.value })} className={`h-11 ${feld}`}>
            <option value="">Kein Video</option>
            {videos.map((v) => <option key={v.key} value={v.key}>{v.titel}</option>)}
          </select>
        </div>
        <div>
          <span className="text-[13px] font-medium text-gray-600">Positionen</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {positionen.map((p) => {
              const an = f.positionen.includes(p.id);
              return (
                <button key={p.id} type="button" onClick={() => setF({ ...f, positionen: an ? f.positionen.filter((x) => x !== p.id) : [...f.positionen, p.id] })} className={`rounded-full px-3 py-1 text-[13px] ${an ? 'bg-red-950 text-red-50' : 'bg-panel text-gray-600'}`}>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
        <Input value={f.step_keys} onChange={(e) => setF({ ...f, step_keys: e.target.value })} placeholder="Ablauf-Schritte (z. B. s_funnel, s_funnel_tracking)" />
        {t('zusammenfassung', 'Zusammenfassung', 2)}
        {t('zweck', 'Wozu', 2)}
        {t('ausloeser', 'Wann / Auslöser', 2)}
        {t('automatisch', 'Das macht die Cloud/KI automatisch', 4, 'eine Zeile je Punkt')}
        {t('schritte', 'Das machst du', 6, 'eine Zeile je Schritt')}
        {t('qualitaet', 'Qualitätscheck', 3, 'eine Zeile je Punkt')}
        {t('fehler', 'Häufige Fehler', 3, 'eine Zeile je Punkt')}
        {t('links', 'Links in die Cloud', 3, 'Label | /pfad')}
        {t('inhalt', 'Freitext (Markdown: ## Überschrift, - Liste, 1. Schritt, > Hinweis)', 12)}
        <div className="flex items-center gap-3">
          <button onClick={speichern} disabled={speichert} className="inline-flex items-center rounded-full bg-red-950 px-5 py-2 text-[14px] font-medium text-red-50 disabled:opacity-40">{speichert ? 'Speichert …' : 'Speichern'}</button>
          {msg && <span className="text-[14px] text-gray-600">{msg}</span>}
        </div>
      </Card>
    </div>
  );
}
