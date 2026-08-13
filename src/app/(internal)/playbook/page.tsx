'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import type { PlaybookEntry } from '@/lib/types/database';
import { ChevronDown, ChevronUp, Search, AlertTriangle } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Accordion Item                                                      */
/* ------------------------------------------------------------------ */

function AccordionItem({ entry }: { entry: PlaybookEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <Card padding="sm" className="transition-shadow hover:shadow-md">
      {/* Header — always visible */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left cursor-pointer"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <Badge tone="softAccent" className="text-[11px] !px-2 !py-0.5 font-mono">
              {entry.problem_key}
            </Badge>
            {entry.escalation_trigger && (
              <Badge tone="accent" className="text-[11px] !px-2 !py-0.5">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Eskalation
              </Badge>
            )}
          </div>
          <p className="text-[15px] font-semibold text-gray-900 leading-snug">
            {entry.title}
          </p>
        </div>
        <div className="flex-shrink-0 text-gray-400">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Body — visible when expanded */}
      {open && (
        <div className="mt-5 space-y-8 border-t border-gray-200 pt-5">
          {/* Beschreibung */}
          <div>
            <p className="text-[14px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Beschreibung
            </p>
            <p className="text-[14px] text-gray-900 leading-relaxed">
              {entry.description}
            </p>
          </div>

          {/* Ursachen */}
          {entry.causes.length > 0 && (
            <div>
              <p className="text-[14px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Ursachen
              </p>
              <ul className="space-y-3">
                {entry.causes.map((cause, i) => (
                  <li key={i} className="flex items-start gap-2 text-[14px] text-gray-900">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-600/70 flex-shrink-0" />
                    {cause}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sofort-Maßnahmen */}
          {entry.immediate_actions.length > 0 && (
            <div>
              <p className="text-[14px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Sofort-Maßnahmen
              </p>
              <ol className="space-y-3">
                {entry.immediate_actions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[14px] text-gray-900">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    {action}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Langfristige Maßnahmen */}
          {entry.long_term_actions.length > 0 && (
            <div>
              <p className="text-[14px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Langfristig
              </p>
              <ul className="space-y-3">
                {entry.long_term_actions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2 text-[14px] text-gray-900">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Eskalations-Trigger */}
          {entry.escalation_trigger && (
            <Card inset padding="sm" className="border-red-100 bg-red-50">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] font-bold text-red-600 uppercase tracking-wide mb-0.5">
                    Eskalations-Trigger
                  </p>
                  <p className="text-[14px] text-red-700 leading-relaxed">
                    {entry.escalation_trigger}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function PlaybookPage() {
  const [entries, setEntries] = useState<PlaybookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchEntries = useCallback(() => {
    fetch('/api/playbook')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEntries(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    return (
      !q ||
      e.title.toLowerCase().includes(q) ||
      e.problem_key.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-[#E31B23] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        label="WERKZEUGE"
        title="Playbook"
        description="Problemlösungen und Handlungsempfehlungen für häufige KPI-Abweichungen"
        counter={`${filtered.length} Einträge`}
      />

      {/* Search */}
      <div className="mb-8 max-w-sm">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen..."
          icon={<Search className="w-4 h-4" />}
        />
      </div>

      {/* Accordion list */}
      <div className="space-y-5">
        {filtered.length === 0 ? (
          <Card padding="lg">
            <p className="text-center text-[14px] text-gray-400">
              {search ? `Keine Einträge für „${search}"` : 'Keine Playbook-Einträge vorhanden.'}
            </p>
          </Card>
        ) : (
          filtered.map((entry) => <AccordionItem key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
