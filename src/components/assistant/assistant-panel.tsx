'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUp, RotateCcw, Sparkles, X } from 'lucide-react';
import type { Audience } from '@/lib/help/articles';

interface ChatItem {
  role: 'user' | 'assistant';
  text: string;
  /** Werkzeug-Hinweise während der Antwort („Schaut in deine Aufgaben …“) */
  steps?: string[];
  error?: boolean;
}

const STORAGE_KEY = 'zoepp-assistant-v1';

const VORSCHLAEGE: Record<Audience, string[]> = {
  kunde: ['Wie viele Bewerber hatten wir diese Woche?', 'Was muss ich als Nächstes erledigen?', 'Wie verbinde ich WhatsApp?'],
  team: ['Was liegt heute bei mir an?', 'Welche Kunden sind überfällig?', 'Was steht diese Woche im Kalender?'],
  admin: ['Welche Kunden hängen gerade?', 'Wer im Team hat noch Luft?', 'Was liegt heute bei mir an?'],
};

/** Sehr kleiner Markdown-Renderer: **fett**, Listen mit „- “, Links [Text](/pfad), Absätze */
function renderInline(text: string, keyBase: string) {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<strong key={`${keyBase}-b${i++}`}>{m[1]}</strong>);
    else if (m[2] && m[3]) {
      const href = m[3];
      parts.push(
        href.startsWith('/') ? (
          <Link key={`${keyBase}-l${i++}`} href={href} className="font-medium text-red-800 underline underline-offset-2">
            {m[2]}
          </Link>
        ) : (
          <a key={`${keyBase}-l${i++}`} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-red-800 underline underline-offset-2">
            {m[2]}
          </a>
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={bi} className="space-y-1 pl-1">
              {lines.map((l, li) => (
                <li key={li} className="flex gap-2">
                  <span className="mt-[9px] h-1 w-1 flex-none rounded-full bg-current opacity-60" />
                  <span>{renderInline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''), `${bi}-${li}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="whitespace-pre-wrap">
            {renderInline(block, `${bi}`)}
          </p>
        );
      })}
    </div>
  );
}

function load(): { items: ChatItem[]; api: unknown[] } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignorieren */
  }
  return { items: [], api: [] };
}

export function AssistantPanel({ audience, userName }: { audience: Audience; userName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [api, setApi] = useState<unknown[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const restored = useRef(false);

  // Verlauf der Sitzung beim ersten Öffnen wiederherstellen
  useEffect(() => {
    if (!open || restored.current) return;
    restored.current = true;
    const saved = load();
    Promise.resolve().then(() => {
      setItems(saved.items);
      setApi(saved.api);
    });
  }, [open]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ items, api }));
    } catch {
      /* Speicher voll oder gesperrt – egal */
    }
  }, [items, api]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [items]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    setItems((prev) => [...prev, { role: 'user', text: q }, { role: 'assistant', text: '', steps: [] }]);
    const patchLast = (fn: (it: ChatItem) => ChatItem) =>
      setItems((prev) => prev.map((it, i) => (i === prev.length - 1 ? fn(it) : it)));

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, messages: api, page: pathname }),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        patchLast((it) => ({ ...it, text: err.error ?? 'Die KI ist gerade nicht erreichbar.', error: true }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as
            | { type: 'text'; delta: string }
            | { type: 'tool'; label: string }
            | { type: 'done'; messages: unknown[] }
            | { type: 'error'; message: string };
          if (ev.type === 'text') patchLast((it) => ({ ...it, text: it.text + ev.delta }));
          else if (ev.type === 'tool') patchLast((it) => ({ ...it, steps: [...(it.steps ?? []), ev.label] }));
          else if (ev.type === 'done') setApi(ev.messages);
          else if (ev.type === 'error') patchLast((it) => ({ ...it, text: it.text || ev.message, error: !it.text }));
        }
      }
    } catch {
      patchLast((it) => ({ ...it, text: it.text || 'Verbindung unterbrochen. Bitte noch einmal versuchen.', error: !it.text }));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setItems([]);
    setApi([]);
  }

  const vorname = userName.split(/\s+/)[0];

  return (
    <>
      {/* Schwebender Knopf */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fx-shell fixed bottom-[calc(96px+env(safe-area-inset-bottom))] right-3 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-b from-red-800 to-red-950 pl-3.5 pr-4 text-[15px] font-medium text-red-50 shadow-[0_18px_40px_-14px_#3b0b09cc] transition-transform hover:-translate-y-0.5 md:bottom-6 md:right-6 md:h-[52px] md:pl-4 md:pr-5"
          aria-label="KI-Assistent öffnen"
        >
          <Sparkles className="h-5 w-5" />
          <span className="hidden sm:inline">KI-Assistent</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] md:inset-auto md:bottom-6 md:right-6">
          <div className="absolute inset-0 bg-ink/30 md:hidden" onClick={() => setOpen(false)} />
          <section
            role="dialog"
            aria-label="KI-Assistent"
            className="fx-sheet absolute inset-x-0 bottom-0 flex h-[88dvh] flex-col overflow-hidden rounded-t-2xl bg-card shadow-[0_30px_80px_-30px_#1a151499] md:static md:h-[min(680px,calc(100dvh-48px))] md:w-[420px] md:rounded-2xl"
          >
            {/* Kopf */}
            <header className="fx-swirl flex items-center gap-3 px-5 py-4">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-red-50 text-red-950">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-semibold tracking-[-0.02em]">KI-Assistent</p>
                <p className="text-[12.5px] text-red-200">Kennt deine Daten in der Cloud</p>
              </div>
              {items.length > 0 && (
                <button onClick={reset} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Neues Gespräch" title="Neues Gespräch">
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Schließen">
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Verlauf */}
            <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
              {items.length === 0 && (
                <div className="px-1">
                  <p className="text-[22px] font-semibold leading-tight tracking-[-0.03em]">Hallo {vorname}, wobei kann ich helfen?</p>
                  <p className="mt-2 text-[14px] text-gray-600">
                    Ich schaue direkt in die Cloud – {audience === 'kunde' ? 'deine Bewerber, Zahlen und Aufgaben' : 'Aufgaben, Kunden, Team und Kalender'}.
                  </p>
                  <div className="mt-5 space-y-2">
                    {VORSCHLAEGE[audience].map((v) => (
                      <button
                        key={v}
                        onClick={() => ask(v)}
                        className="block w-full rounded-[14px] bg-panel px-4 py-3 text-left text-[14.5px] transition-colors hover:bg-red-50"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {items.map((it, i) =>
                it.role === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-[18px] rounded-br-[6px] bg-gradient-to-b from-red-800 to-red-950 px-4 py-2.5 text-[14.5px] text-red-50">
                      {it.text}
                    </p>
                  </div>
                ) : (
                  <div key={i} className="max-w-[92%] text-[14.5px] leading-relaxed">
                    {it.steps && it.steps.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {it.steps.map((s, si) => (
                          <span key={si} className="inline-flex items-center gap-1 rounded-full bg-panel px-2.5 py-1 text-[12px] text-gray-600">
                            <Sparkles className="h-3 w-3 text-red-700" /> {s}
                          </span>
                        ))}
                      </div>
                    )}
                    {it.text ? (
                      <div className={it.error ? 'text-red-700' : 'text-ink'}>
                        <Markdown text={it.text} />
                      </div>
                    ) : (
                      busy &&
                      i === items.length - 1 && (
                        <span className="inline-flex gap-1 py-2" aria-label="Denkt nach">
                          {[0, 1, 2].map((d) => (
                            <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-red-300" style={{ animationDelay: `${d * 150}ms` }} />
                          ))}
                        </span>
                      )
                    )}
                  </div>
                ),
              )}
            </div>

            {/* Eingabe */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="border-t border-hair p-3 pb-[max(12px,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-end gap-2 rounded-[22px] bg-panel p-1.5 pl-4 focus-within:shadow-[var(--focus)]">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      ask(input);
                    }
                  }}
                  rows={1}
                  placeholder="Frag mich etwas …"
                  aria-label="Frage an den KI-Assistenten"
                  className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-gray-500 focus-visible:shadow-none"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="grid h-10 w-10 flex-none place-items-center rounded-full bg-gradient-to-b from-red-700 to-red-950 text-red-50 transition-opacity disabled:opacity-40"
                  aria-label="Senden"
                >
                  <ArrowUp className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-1.5 px-2 text-center text-[11px] text-gray-500">KI kann sich irren – wichtige Angaben bitte prüfen.</p>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
