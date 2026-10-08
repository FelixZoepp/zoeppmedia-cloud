'use client';

import { useState } from 'react';
import { Send, Star } from 'lucide-react';
import type { Frage } from '@/lib/surveys/planung';

/** Öffentliches Umfrage-Formular für den persönlichen Link – gleiche Bedienung wie im Kundenportal */
export function UmfrageFormular({ token, fragen, vorbelegung = {} }: { token: string; fragen: Frage[]; vorbelegung?: Record<string, number> }) {
  const [antworten, setAntworten] = useState<Record<string, string | number>>(vorbelegung);
  const [kommentar, setKommentar] = useState('');
  const [sendet, setSendet] = useState(false);
  const [fertig, setFertig] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const setze = (id: string, wert: string | number) => setAntworten((prev) => ({ ...prev, [id]: wert }));

  async function absenden() {
    setSendet(true);
    setFehler(null);
    try {
      const res = await fetch(`/api/umfrage/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ antworten, kommentar }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Senden fehlgeschlagen');
      setFertig(true);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Senden fehlgeschlagen');
    } finally {
      setSendet(false);
    }
  }

  if (fertig) {
    return (
      <div className="py-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <Star className="h-8 w-8 text-green-700" />
        </div>
        <h2 className="mb-2 text-lg font-bold text-gray-900">Danke für dein Feedback!</h2>
        <p className="text-gray-600">Wir nutzen es, um noch besser zu werden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {fragen.map((q) => (
        <div key={q.id}>
          <label className="mb-2 block text-sm font-medium text-gray-900">{q.label}</label>

          {q.type === 'rating' && (
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((stern) => (
                <button key={stern} type="button" aria-label={`${stern} von 5`} onClick={() => setze(q.id, stern)} className="transition-transform hover:scale-110">
                  <Star className={`h-9 w-9 ${((antworten[q.id] as number) || 0) >= stern ? 'fill-amber-500 text-amber-500' : 'text-gray-200'}`} />
                </button>
              ))}
            </div>
          )}

          {q.type === 'choice' && q.options && (
            <div className="flex flex-wrap gap-2">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setze(q.id, opt)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    antworten[q.id] === opt ? 'border-red-600 bg-red-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {q.type === 'text' && (
            <textarea
              value={(antworten[q.id] as string) || ''}
              onChange={(e) => setze(q.id, e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full resize-none rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-red-400"
              placeholder="Deine Antwort..."
            />
          )}

          {q.type === 'nps' && (
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 11 }, (_, n) => n).map((n) => {
                const farbe =
                  n <= 6 ? 'bg-red-100 text-red-700 border-red-200' : n <= 8 ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-green-100 text-green-700 border-green-200';
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setze(q.id, n)}
                    className={`h-9 w-9 rounded-lg border text-sm font-semibold ${farbe} ${antworten[q.id] === n ? 'ring-2 ring-gray-400 ring-offset-1' : ''}`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Kommentar (optional)</label>
        <textarea
          value={kommentar}
          onChange={(e) => setKommentar(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full resize-none rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400"
          placeholder="Was können wir besser machen?"
        />
      </div>

      {fehler && <p className="text-sm text-red-600">{fehler}</p>}

      <button
        type="button"
        onClick={absenden}
        disabled={sendet || !Object.keys(antworten).length}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        {sendet ? 'Wird gesendet...' : 'Feedback senden'}
      </button>
    </div>
  );
}
