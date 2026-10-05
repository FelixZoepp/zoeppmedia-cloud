'use client';

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { placeholderCount } from '@/lib/whatsapp/template-text';

interface Props {
  onSend: (templateId: string, variables: Record<string, string>) => void;
  sending: boolean;
  /** Für {{1}} vorbelegen (fast alle Vorlagen beginnen mit „Hallo {{1}}“) */
  candidateName?: string;
}

interface Template {
  id: string;
  name: string;
  body: string;
  variables: string[];
  status: string;
}

/** Bezeichnung eines Platzhalters: aus der Vorlage, sonst eine sinnvolle Vermutung */
function labelFor(t: Template, i: number): string {
  const v = t.variables?.[i];
  if (v) return v.charAt(0).toUpperCase() + v.slice(1);
  return i === 0 ? 'Vorname' : `Wert ${i + 1}`;
}

export function TemplatePicker({ onSend, sending, candidateName = '' }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/whatsapp/templates?status=approved')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setTemplates(data.filter((t: Template) => t.status === 'approved'));
      });
  }, []);

  const selected = templates.find((t) => t.id === selectedId);
  // Anzahl aus dem Text ermitteln – die gespeicherte Variablen-Liste ist bei manchen Vorlagen leer
  const count = selected ? placeholderCount(selected.body) : 0;
  const values = Array.from({ length: count }, (_, i) => variables[String(i + 1)] ?? '');
  const complete = values.every((v) => v.trim());
  const preview = selected ? selected.body.replace(/\{\{(\d+)\}\}/g, (m, n) => values[Number(n) - 1]?.trim() || m) : '';

  function choose(t: Template) {
    setSelectedId(t.id);
    const vorname = candidateName.trim().split(/\s+/)[0] ?? '';
    // Name nur vorbelegen, wenn er nach einem Namen aussieht (nicht „+49 151 …“)
    setVariables(placeholderCount(t.body) > 0 && /^\p{L}/u.test(vorname) ? { '1': vorname } : {});
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">24-Stunden-Fenster geschlossen – jetzt sind nur freigegebene Vorlagen erlaubt.</p>
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {templates.length === 0 && <span className="text-xs text-gray-500">Keine freigegebenen Vorlagen vorhanden.</span>}
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => choose(t)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedId === t.id ? 'bg-gradient-to-b from-red-700 to-red-950 text-red-50' : 'bg-panel text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t.name.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      {selected && (
        <div className="space-y-3 rounded-[16px] bg-panel p-3">
          {count > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {values.map((v, i) => (
                <label key={i} className="block">
                  <span className="mb-1 block text-[12px] font-medium text-gray-600">
                    {`{{${i + 1}}}`} {labelFor(selected, i)}
                  </span>
                  <input
                    value={v}
                    onChange={(e) => setVariables((prev) => ({ ...prev, [String(i + 1)]: e.target.value }))}
                    className="h-10 w-full rounded-[12px] bg-card px-3 text-[14px] shadow-[inset_0_0_0_1.5px_var(--hair)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--r-700)]"
                  />
                </label>
              ))}
            </div>
          )}
          <div>
            <span className="mb-1 block text-[12px] font-medium text-gray-600">Vorschau</span>
            <p className="whitespace-pre-wrap rounded-[14px] rounded-br-[6px] bg-gradient-to-b from-red-800 to-red-950 px-3.5 py-2.5 text-[14px] leading-snug text-red-50">{preview}</p>
          </div>
          <Button onClick={() => selectedId && onSend(selectedId, variables)} disabled={sending || !complete} size="sm">
            <Send className="h-3.5 w-3.5" />
            {complete ? 'Vorlage senden' : 'Bitte alle Platzhalter ausfüllen'}
          </Button>
        </div>
      )}
    </div>
  );
}
