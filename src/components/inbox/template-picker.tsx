'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';

interface Props {
  onSend: (templateId: string, variables: Record<string, string>) => void;
  sending: boolean;
}

interface Template {
  id: string;
  name: string;
  body: string;
  variables: string[];
  status: string;
}

export function TemplatePicker({ onSend, sending }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/whatsapp/templates?status=approved')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setTemplates(data.filter((t: Template) => t.status === 'approved'));
        }
      });
  }, []);

  const selected = templates.find(t => t.id === selectedId);

  function handleVariableChange(key: string, value: string) {
    setVariables(prev => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">24h-Fenster geschlossen — nur Vorlagen erlaubt</p>
      <div className="flex flex-wrap gap-1.5">
        {templates.map(t => (
          <button
            key={t.id}
            onClick={() => {
              setSelectedId(t.id);
              setVariables({});
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedId === t.id
                ? 'bg-red-50 text-red-600 border border-red-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.name.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      {selected && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.body}</p>
          {selected.variables?.length > 0 && (
            <div className="space-y-1.5">
              {selected.variables.map((v: string, i: number) => (
                <Input
                  key={v}
                  placeholder={`{{${i + 1}}} ${v}`}
                  value={variables[String(i + 1)] || ''}
                  onChange={e => handleVariableChange(String(i + 1), e.target.value)}
                  className="text-sm"
                />
              ))}
            </div>
          )}
          <Button
            onClick={() => selectedId && onSend(selectedId, variables)}
            disabled={sending}
            size="sm"
          >
            <Send className="w-3.5 h-3.5" />
            Vorlage senden
          </Button>
        </div>
      )}
    </div>
  );
}
