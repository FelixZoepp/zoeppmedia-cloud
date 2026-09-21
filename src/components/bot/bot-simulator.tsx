'use client';

/**
 * BotSimulator — Chat-Panel zum Testen des KI-Vorqualifizierungsbots.
 * Phase 3 Task 10.
 *
 * Stil lehnt sich an chat-pane.tsx an.
 * Ruft POST /api/bot/simulate auf, zeigt Bot-Antworten und
 * bei done=true einen Score-Badge mit reasons-Liste.
 */

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, RotateCcw, Bot, User } from 'lucide-react';
import { toast } from 'sonner';
import type { DialogOutput } from '@/lib/bot/schema';
import type { ScoreResult } from '@/lib/bot/scoring';

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

interface HistoryItem {
  role: 'candidate' | 'bot';
  text: string;
}

interface CollectedItem {
  question_key: string;
  value: unknown;
}

interface Props {
  jobId: string;
}

// ---------------------------------------------------------------------------
// Score-Badge
// ---------------------------------------------------------------------------

const LABEL_STYLES: Record<string, string> = {
  A: 'bg-green-100 text-green-800 border-green-200',
  B: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  C: 'bg-red-100 text-red-800 border-red-200',
};

const LABEL_TITLES: Record<string, string> = {
  A: 'Top-Kandidat',
  B: 'Geeignet',
  C: 'Nicht geeignet',
};

function ScoreBadge({ score }: { score: ScoreResult }) {
  return (
    <div className={`rounded-xl border p-4 mt-3 ${LABEL_STYLES[score.label]}`}>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl font-bold">{score.label}</span>
        <div>
          <p className="text-sm font-semibold">{LABEL_TITLES[score.label]}</p>
          <p className="text-xs opacity-70">Score: {score.score}/100</p>
        </div>
        {score.knockout && (
          <span className="ml-auto text-xs font-semibold bg-red-200 text-red-800 px-2 py-0.5 rounded-full">
            K.o.
          </span>
        )}
      </div>
      {score.reasons.length > 0 && (
        <ul className="text-xs space-y-0.5 opacity-80">
          {score.reasons.map(r => (
            <li key={r.question_key} className="flex items-start gap-1">
              <span className="font-mono">{r.question_key}:</span>
              <span>{r.note}{r.knockout ? ' ⚠ K.o.' : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hauptkomponente
// ---------------------------------------------------------------------------

export function BotSimulator({ jobId }: Props) {
  const [history, setHistory]     = useState<HistoryItem[]>([]);
  const [collected, setCollected] = useState<CollectedItem[]>([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [score, setScore]         = useState<ScoreResult | undefined>(undefined);
  const [lastOutput, setLastOutput] = useState<DialogOutput | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  function reset() {
    setHistory([]);
    setCollected([]);
    setInput('');
    setLoading(false);
    setDone(false);
    setScore(undefined);
    setLastOutput(undefined);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const newHistory: HistoryItem[] = [
      ...history,
      { role: 'candidate', text },
    ];
    setHistory(newHistory);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/bot/simulate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          job_id:    jobId,
          history:   newHistory,
          collected,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Simulationsfehler');
        // Letzte user-Nachricht aus History entfernen bei Fehler
        setHistory(history);
        return;
      }

      // Bot-Antwort anhängen
      setHistory([...newHistory, { role: 'bot', text: data.reply }]);
      setCollected(data.collected ?? []);
      setLastOutput(data.output);

      if (data.done) {
        setDone(true);
        setScore(data.score);
      }
    } catch {
      toast.error('Netzwerkfehler');
      setHistory(history);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col h-full min-h-[500px] border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-red-500" />
          <span className="text-sm font-semibold text-gray-800">Bot-Simulator</span>
          {done && (
            <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium">
              Abgeschlossen
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={reset} disabled={loading}>
          <RotateCcw className="w-3.5 h-3.5" />
          Simulation zurücksetzen
        </Button>
      </div>

      {/* Nachrichten */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
        {history.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">
            Schreibe eine Nachricht, um die Simulation zu starten.
          </p>
        )}

        {history.map((msg, idx) => {
          const isBot = msg.role === 'bot';
          return (
            <div key={idx} className={`flex ${isBot ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                isBot
                  ? 'bg-blue-50 text-blue-900'
                  : 'bg-gray-100 text-gray-900'
              }`}>
                <div className="flex items-center gap-1 mb-0.5">
                  {isBot
                    ? <Bot className="w-3.5 h-3.5 text-blue-400" />
                    : <User className="w-3.5 h-3.5 text-gray-400" />
                  }
                  <span className="text-xs text-gray-400">
                    {isBot ? 'Bot' : 'Bewerber'}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-blue-50 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {/* Score-Badge wenn fertig */}
        {done && score && (
          <div className="px-2">
            <ScoreBadge score={score} />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Gesammelte Antworten (kompakt) */}
      {collected.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-2">
          <p className="text-xs text-gray-400 font-medium mb-1">
            Gesammelte Antworten ({collected.length}):
          </p>
          <div className="flex flex-wrap gap-1">
            {collected.map(c => (
              <span
                key={c.question_key}
                className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600"
              >
                {c.question_key}: <strong>{String(c.value)}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Eingabe */}
      <div className="border-t border-gray-200 p-3 bg-white">
        {done ? (
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-2">
              Simulation abgeschlossen.
            </p>
            <Button variant="secondary" size="sm" onClick={reset}>
              <RotateCcw className="w-3.5 h-3.5" />
              Neu starten
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                placeholder="Bewerber-Antwort eingeben…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
            </div>
            <Button
              onClick={send}
              disabled={loading || !input.trim()}
              size="md"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Debug: letztes Output */}
      {lastOutput && (
        <details className="border-t border-gray-100 bg-gray-50 text-xs">
          <summary className="px-4 py-1.5 text-gray-400 cursor-pointer hover:text-gray-600">
            Debug: letztes LLM-Output
          </summary>
          <pre className="px-4 pb-3 text-gray-500 overflow-x-auto">
            {JSON.stringify(lastOutput, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
