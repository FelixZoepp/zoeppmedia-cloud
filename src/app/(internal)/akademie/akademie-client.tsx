'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Bot, CheckCircle2, ChevronRight, GraduationCap, PlayCircle, Search, Send, ThumbsDown, ThumbsUp, Users, Video, Settings2 } from 'lucide-react';
import { lernpfadFuer, fortschrittVon } from '@/lib/akademie/lernpfade';
import { Badge, Card, Input, PageHeader, SegmentedControl } from '@/components/ui';

interface ArtikelKurz {
  slug: string;
  typ: 'sop' | 'skript' | 'wissen' | 'faq' | 'rolle';
  titel: string;
  modul: string;
  positionen: string[];
  status: 'entwurf' | 'freigegeben';
  zusammenfassung: string | null;
  reihenfolge: number;
  video: { status: string; laenge_min: number; hatVideo: boolean } | null;
}
interface Daten {
  admin: boolean;
  meinePositionen: string[];
  vorschlag: string[];
  positionen: Array<{ id: string; label: string; beschreibung: string }>;
  artikel: ArtikelKurz[];
  fortschritt: Record<string, { gelesen: boolean; video: boolean }>;
}
interface BotNachricht {
  frage: string;
  antwort?: string;
  quellen?: Array<{ slug: string; titel: string }>;
  luecke?: boolean;
  id?: string | null;
  bewertung?: 1 | -1;
  fehler?: string;
}

const TYP_LABEL: Record<ArtikelKurz['typ'], string> = { sop: 'SOP', skript: 'Skript', wissen: 'Wissen', faq: 'FAQ', rolle: 'Rolle' };

export function AkademieClient() {
  const [daten, setDaten] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<'wissen' | 'bot'>('wissen');
  const [position, setPosition] = useState<string>('alle');
  const [q, setQ] = useState('');
  const [treffer, setTreffer] = useState<ArtikelKurz[] | null>(null);
  const [chat, setChat] = useState<BotNachricht[]>([]);
  const [frage, setFrage] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    fetch('/api/akademie')
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json().catch(() => ({}))).error ?? 'Fehler')))
      .then((d: Daten) => {
        setDaten(d);
        // Aus der Hilfe-Leiste: „Frag die Akademie“ mit vorbelegter Frage
        const f = new URLSearchParams(window.location.search).get('frage');
        if (f) {
          setAnsicht('bot');
          setFrage(f);
        }
      })
      .catch((e) => setFehler(String(e)));
  }, []);

  useEffect(() => {
    const begriff = q.trim();
    if (begriff.length < 3) return;
    const t = setTimeout(() => {
      fetch(`/api/akademie/suche?q=${encodeURIComponent(begriff)}`)
        .then((r) => r.json())
        .then((d) => setTreffer((d.treffer ?? []) as ArtikelKurz[]))
        .catch(() => setTreffer([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Treffer nur zeigen, solange ein Suchbegriff eingegeben ist
  const suchTreffer = q.trim().length >= 3 ? treffer : null;

  const sichtbar = useMemo(() => {
    if (!daten) return [];
    if (position === 'alle') return daten.artikel;
    if (position === 'meine') return daten.artikel.filter((a) => a.positionen.some((p) => daten.vorschlag.includes(p)));
    return daten.artikel.filter((a) => a.positionen.includes(position));
  }, [daten, position]);

  const nachModul = useMemo(() => {
    const m = new Map<string, ArtikelKurz[]>();
    for (const a of sichtbar) m.set(a.modul, [...(m.get(a.modul) ?? []), a]);
    return [...m.entries()];
  }, [sichtbar]);

  const fortschritt = useMemo(() => {
    if (!daten) return { gelesen: 0, gesamt: 0 };
    const freigegeben = sichtbar.filter((a) => a.status === 'freigegeben');
    return { gelesen: freigegeben.filter((a) => daten.fortschritt[a.slug]?.gelesen).length, gesamt: freigegeben.length };
  }, [daten, sichtbar]);

  async function fragen() {
    const f = frage.trim();
    if (f.length < 3 || laeuft) return;
    setFrage('');
    setLaeuft(true);
    setChat((c) => [...c, { frage: f }]);
    try {
      const res = await fetch('/api/akademie/bot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frage: f }) });
      const d = await res.json();
      setChat((c) => c.map((n, i) => (i === c.length - 1 ? (res.ok ? { ...n, ...d } : { ...n, fehler: d.error ?? 'Fehler' }) : n)));
    } catch {
      setChat((c) => c.map((n, i) => (i === c.length - 1 ? { ...n, fehler: 'Keine Verbindung' } : n)));
    } finally {
      setLaeuft(false);
    }
  }

  async function bewerten(idx: number, bewertung: 1 | -1) {
    const n = chat[idx];
    if (!n.id) return;
    setChat((c) => c.map((x, i) => (i === idx ? { ...x, bewertung } : x)));
    await fetch(`/api/akademie/bot/${n.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bewertung }) });
  }

  if (fehler) return <Card className="p-6 text-[15px] text-red-700">{fehler}</Card>;
  if (!daten) return <div className="p-6 text-[15px] text-gray-500">Lädt …</div>;

  const positionsOptionen = [
    { value: 'alle', label: daten.admin ? 'Alles' : 'Alles für mich' },
    ...(!daten.admin ? [{ value: 'meine', label: 'Meine Funktion' }] : []),
    ...daten.positionen.filter((p) => daten.admin || daten.meinePositionen.includes(p.id)).map((p) => ({ value: p.id, label: p.label })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        label="Team"
        title="Team-Akademie"
        description="Jede Aufgabe Schritt für Schritt – mit SOP, Video und einem Bot, der deine Fragen aus unserem Wissen beantwortet."
        counter={fortschritt.gesamt ? `${fortschritt.gelesen}/${fortschritt.gesamt} gelesen` : undefined}
        action={daten.admin ? <Link href="/admin/akademie" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-red-800 hover:underline"><Settings2 className="h-4 w-4" /> Verwalten</Link> : undefined}
      />

      <SegmentedControl
        value={ansicht}
        onChange={(v) => setAnsicht(v as 'wissen' | 'bot')}
        items={[
          { value: 'wissen', label: 'Wissen & SOPs' },
          { value: 'bot', label: 'Frag die Akademie' },
        ]}
      />

      {ansicht === 'bot' ? (
        <Card className="p-4 sm:p-5">
          <div className="space-y-4">
            {chat.length === 0 && (
              <p className="text-[15px] text-gray-600">
                Stell eine Frage zu deiner Arbeit, z. B. „Wie prüfe ich den Pixel im Funnel?“ oder „Was mache ich, wenn ein Kunde den Vertrag nicht bestätigt?“. Der Bot antwortet nur aus Artikeln, die für dich freigeschaltet sind.
              </p>
            )}
            {chat.map((n, i) => (
              <div key={i} className="space-y-2">
                <div className="ml-auto w-fit max-w-[85%] rounded-[14px] bg-red-100 px-3 py-2 text-[15px]">{n.frage}</div>
                {n.fehler && <div className="w-fit max-w-[85%] rounded-[14px] bg-red-50 px-3 py-2 text-[15px] text-red-700">{n.fehler}</div>}
                {n.antwort && (
                  <div className="w-fit max-w-[92%] rounded-[14px] bg-card px-3 py-2 text-[15px] shadow-[inset_0_0_0_1.5px_var(--hair)]">
                    <p className="whitespace-pre-wrap">{n.antwort}</p>
                    {!!n.quellen?.length && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {n.quellen.map((q, j) => (
                          <Link key={q.slug} href={`/akademie/${q.slug}`} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[12.5px] text-gray-700 hover:bg-gray-200">
                            <BookOpen className="h-3 w-3" /> [{j + 1}] {q.titel}
                          </Link>
                        ))}
                      </div>
                    )}
                    {n.luecke && <p className="mt-2 text-[12.5px] text-amber-700">Als Wissenslücke an Felix gemeldet.</p>}
                    {n.id && (
                      <div className="mt-2 flex gap-2 text-gray-500">
                        <button aria-label="Hilfreich" onClick={() => bewerten(i, 1)} className={n.bewertung === 1 ? 'text-green-700' : 'hover:text-gray-800'}><ThumbsUp className="h-4 w-4" /></button>
                        <button aria-label="Nicht hilfreich" onClick={() => bewerten(i, -1)} className={n.bewertung === -1 ? 'text-red-700' : 'hover:text-gray-800'}><ThumbsDown className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                )}
                {!n.antwort && !n.fehler && <div className="w-fit rounded-[14px] bg-card px-3 py-2 text-[15px] text-gray-500 shadow-[inset_0_0_0_1.5px_var(--hair)]">Sucht in der Akademie …</div>}
              </div>
            ))}
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              fragen();
            }}
          >
            <Input value={frage} onChange={(e) => setFrage(e.target.value)} placeholder="Deine Frage …" icon={<Bot className="h-4 w-4" />} className="flex-1" maxLength={600} />
            <button type="submit" disabled={laeuft || frage.trim().length < 3} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-red-950 px-4 text-[14px] font-medium text-red-50 disabled:opacity-40">
              <Send className="h-4 w-4" /> Fragen
            </button>
          </form>
        </Card>
      ) : (
        <>
          <BereichsKacheln daten={daten} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen, z. B. „Pixel“, „Vertrag“, „No-Show“ …" icon={<Search className="h-4 w-4" />} className="sm:max-w-md sm:flex-1" />
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {positionsOptionen.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setPosition(o.value)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium ${position === o.value ? 'bg-gradient-to-b from-red-700 to-red-950 text-red-50' : 'bg-panel text-gray-600 hover:text-ink'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {suchTreffer ? (
            <Card className="p-4">
              <p className="mb-2 text-[13px] font-medium text-gray-500">{suchTreffer.length} Treffer</p>
              <ArtikelListe artikel={suchTreffer} fortschritt={daten.fortschritt} admin={daten.admin} />
              {suchTreffer.length === 0 && <p className="text-[15px] text-gray-600">Nichts gefunden – frag den Bot, dann landet die Frage bei Felix.</p>}
            </Card>
          ) : (
            nachModul.map(([modul, liste]) => (
              <Card key={modul} className="p-4">
                <h2 className="mb-2 text-[16px] font-semibold tracking-[-0.01em]">{modul}</h2>
                <ArtikelListe artikel={liste} fortschritt={daten.fortschritt} admin={daten.admin} />
              </Card>
            ))
          )}
          {!suchTreffer && nachModul.length === 0 && <Card className="p-6 text-[15px] text-gray-600">Für dich ist noch nichts freigeschaltet. Felix schaltet dir die Bereiche deiner Position frei.</Card>}
        </>
      )}
    </div>
  );
}

/** Jede freigeschaltete Position ist eine eigene Bereichs-Akademie mit Lernpfad und Fortschritt */
function BereichsKacheln({ daten }: { daten: Daten }) {
  const bereiche = daten.positionen.filter((p) => daten.admin || daten.meinePositionen.includes(p.id));
  if (!bereiche.length) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Deine Akademien</h2>
        {daten.admin && (
          <Link href="/admin/akademie/team" className="ml-auto inline-flex items-center gap-1 text-[13.5px] font-medium text-red-800 hover:underline">
            <Users className="h-4 w-4" /> Team-Fortschritt & Reviews
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {bereiche.map((b) => {
          const { stufen } = lernpfadFuer(b.id, daten.artikel);
          const slugs = stufen.flatMap((s) => s.artikel.map((a) => a.slug));
          const f = fortschrittVon(slugs, daten.fortschritt);
          return (
            <Link key={b.id} href={`/akademie/bereich/${b.id}`} className="group rounded-[16px] bg-card p-4 shadow-sm hover:shadow-md">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-red-800" />
                <span className="text-[15.5px] font-semibold">{b.label}</span>
                <ChevronRight className="ml-auto h-4 w-4 text-gray-400 group-hover:text-red-800" />
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] text-gray-600">{b.beschreibung}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel">
                <div className="h-full rounded-full bg-gradient-to-r from-red-700 to-red-950" style={{ width: `${f.prozent}%` }} />
              </div>
              <p className="mt-1 text-[12px] text-gray-500">{f.gesamt ? `${f.gelesen}/${f.gesamt} im Lernpfad gelesen` : 'Inhalte folgen'}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ArtikelListe({ artikel, fortschritt, admin }: { artikel: ArtikelKurz[]; fortschritt: Daten['fortschritt']; admin: boolean }) {
  return (
    <ul className="divide-y divide-[var(--hair)]">
      {artikel.map((a) => {
        const f = fortschritt[a.slug];
        return (
          <li key={a.slug}>
            <Link href={`/akademie/${a.slug}`} className="flex items-start gap-3 py-2.5 hover:bg-panel/60">
              <span className="mt-0.5 flex-none text-gray-400">{f?.gelesen ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <BookOpen className="h-5 w-5" />}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[15px] font-medium">{a.titel}</span>
                  <Badge tone="neutral">{TYP_LABEL[a.typ]}</Badge>
                  {admin && a.status === 'entwurf' && <Badge tone="warning">Entwurf</Badge>}
                  {a.video?.hatVideo && <span className="inline-flex items-center gap-0.5 text-[12px] text-gray-500"><PlayCircle className="h-3.5 w-3.5" /> {a.video.laenge_min} Min.</span>}
                  {a.video && !a.video.hatVideo && a.video.status === 'aufnahme_noetig' && <span className="inline-flex items-center gap-0.5 text-[12px] text-gray-400"><Video className="h-3.5 w-3.5" /> Video folgt</span>}
                </span>
                {a.zusammenfassung && <span className="mt-0.5 block text-[13.5px] text-gray-600">{a.zusammenfassung}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
