'use client';

/**
 * QuestionEditor — Liste der Bot-Fragen mit Hoch/Runter-Buttons (P3-R5),
 * Inline-Bearbeitung aller Felder, Hinzufügen und Löschen.
 * Phase 3 Task 10.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export interface QuestionDraft {
  /** Temporäre Client-ID (kein DB-ID nötig beim Hinzufügen) */
  _id: string;
  key: string;
  text: string;
  type: 'text' | 'number' | 'choice' | 'yes_no' | 'date';
  /** Kommagetrennt für UI; wird beim Speichern in Array umgewandelt */
  optionsRaw: string;
  required: boolean;
  weight: number;
  /** Knockout-Typ: 'none' | 'yes_no_false' | 'choice_no_overlap' | 'number_lt' */
  knockoutType: 'none' | 'yes_no_false' | 'choice_no_overlap' | 'number_lt';
  knockoutLt: string;
}

interface Props {
  questions: QuestionDraft[];
  onChange: (questions: QuestionDraft[]) => void;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function newDraft(): QuestionDraft {
  return {
    _id:          crypto.randomUUID(),
    key:          '',
    text:         '',
    type:         'text',
    optionsRaw:   '',
    required:     true,
    weight:       1,
    knockoutType: 'none',
    knockoutLt:   '',
  };
}

const TYPE_OPTIONS = [
  { value: 'text',   label: 'Text' },
  { value: 'number', label: 'Zahl' },
  { value: 'choice', label: 'Auswahl' },
  { value: 'yes_no', label: 'Ja/Nein' },
  { value: 'date',   label: 'Datum' },
];

// ---------------------------------------------------------------------------
// Komponente
// ---------------------------------------------------------------------------

export function QuestionEditor({ questions, onChange }: Props) {
  function update(idx: number, patch: Partial<QuestionDraft>) {
    const next = questions.map((q, i) => i === idx ? { ...q, ...patch } : q);
    onChange(next);
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...questions];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  }

  function moveDown(idx: number) {
    if (idx === questions.length - 1) return;
    const next = [...questions];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next);
  }

  function remove(idx: number) {
    onChange(questions.filter((_, i) => i !== idx));
  }

  function add() {
    onChange([...questions, newDraft()]);
  }

  return (
    <div className="space-y-3">
      {questions.map((q, idx) => (
        <div
          key={q._id}
          className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
        >
          {/* Kopfzeile: Reihenfolge + Löschen */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"
                title="Nach oben"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => moveDown(idx)}
                disabled={idx === questions.length - 1}
                className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"
                title="Nach unten"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <span className="ml-1 text-xs font-semibold text-gray-400">
                #{idx + 1}
              </span>
            </div>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50"
              title="Frage löschen"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Felder: key + text */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Schlüssel (key)
              </label>
              <Input
                value={q.key}
                onChange={e => update(idx, { key: e.target.value })}
                placeholder="z.B. fuehrerschein"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Typ</label>
              <Select
                value={q.type}
                onChange={e => update(idx, { type: e.target.value as QuestionDraft['type'], knockoutType: 'none' })}
                options={TYPE_OPTIONS}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Fragetext
            </label>
            <Input
              value={q.text}
              onChange={e => update(idx, { text: e.target.value })}
              placeholder="Die Frage, die dem Bewerber gestellt wird"
            />
          </div>

          {/* Optionen (nur bei choice) */}
          {q.type === 'choice' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Optionen <span className="text-gray-400">(kommagetrennt)</span>
              </label>
              <Input
                value={q.optionsRaw}
                onChange={e => update(idx, { optionsRaw: e.target.value })}
                placeholder="Option A, Option B, Option C"
              />
            </div>
          )}

          {/* Gewichtung + Pflichtfrage */}
          <div className="flex items-center gap-4">
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Gewichtung
              </label>
              <Input
                type="number"
                min={0}
                max={10}
                value={q.weight}
                onChange={e => update(idx, { weight: Number(e.target.value) })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 mt-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={q.required}
                onChange={e => update(idx, { required: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              Pflichtfrage
            </label>
          </div>

          {/* Knockout-Logik */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              K.o.-Kriterium
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={q.knockoutType !== 'none'}
                  onChange={e => {
                    if (!e.target.checked) {
                      update(idx, { knockoutType: 'none' });
                    } else {
                      // Standard-Knockout je Typ setzen
                      if (q.type === 'yes_no') update(idx, { knockoutType: 'yes_no_false' });
                      else if (q.type === 'choice') update(idx, { knockoutType: 'choice_no_overlap' });
                      else if (q.type === 'number') update(idx, { knockoutType: 'number_lt' });
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                K.o.-Kriterium aktiv
              </label>

              {/* Threshold bei number_lt */}
              {q.knockoutType === 'number_lt' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Unter</span>
                  <div className="w-20">
                    <Input
                      type="number"
                      value={q.knockoutLt}
                      onChange={e => update(idx, { knockoutLt: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <span className="text-xs text-gray-500">= K.o.</span>
                </div>
              )}
              {q.knockoutType === 'yes_no_false' && (
                <span className="text-xs text-gray-500">Antwort &quot;Nein&quot; = K.o.</span>
              )}
              {q.knockoutType === 'choice_no_overlap' && (
                <span className="text-xs text-gray-500">Keine Übereinstimmung = K.o.</span>
              )}
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={add}
        className="w-full"
      >
        <Plus className="w-4 h-4" />
        Frage hinzufügen
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Konvertierungsfunktionen (Draft ↔ API-Format)
// ---------------------------------------------------------------------------

export type ApiQuestion = {
  key: string;
  text: string;
  type: QuestionDraft['type'];
  options: string[] | null;
  required: boolean;
  weight: number;
  knockout_rule: Record<string, unknown> | null;
};

export function draftToApi(q: QuestionDraft): ApiQuestion {
  const options =
    q.type === 'choice' && q.optionsRaw.trim()
      ? q.optionsRaw.split(',').map(s => s.trim()).filter(Boolean)
      : null;

  let knockout_rule: Record<string, unknown> | null = null;
  if (q.knockoutType === 'yes_no_false') {
    knockout_rule = { equals: false };
  } else if (q.knockoutType === 'choice_no_overlap') {
    knockout_rule = { no_overlap: true };
  } else if (q.knockoutType === 'number_lt' && q.knockoutLt !== '') {
    knockout_rule = { lt: Number(q.knockoutLt) };
  }

  return { key: q.key, text: q.text, type: q.type, options, required: q.required, weight: q.weight, knockout_rule };
}

export function apiToDraft(q: {
  key: string;
  text: string;
  type: QuestionDraft['type'];
  options?: string[] | null;
  required: boolean;
  weight: number;
  knockout_rule?: Record<string, unknown> | null;
}): QuestionDraft {
  let knockoutType: QuestionDraft['knockoutType'] = 'none';
  let knockoutLt = '';

  if (q.knockout_rule) {
    if ('equals' in q.knockout_rule && q.knockout_rule.equals === false) {
      knockoutType = 'yes_no_false';
    } else if (q.knockout_rule.no_overlap === true) {
      knockoutType = 'choice_no_overlap';
    } else if ('lt' in q.knockout_rule && typeof q.knockout_rule.lt === 'number') {
      knockoutType = 'number_lt';
      knockoutLt = String(q.knockout_rule.lt);
    }
  }

  return {
    _id:          crypto.randomUUID(),
    key:          q.key,
    text:         q.text,
    type:         q.type,
    optionsRaw:   q.options?.join(', ') ?? '',
    required:     q.required,
    weight:       q.weight,
    knockoutType,
    knockoutLt,
  };
}
