'use client';

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Clock } from 'lucide-react';

interface Props {
  conversations: Record<string, unknown>[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: string;
  onFilterChange: (f: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  loading: boolean;
}

const FILTERS = [
  { value: 'all', label: 'Alle' },
  { value: 'mine', label: 'Mir zugewiesen' },
  { value: 'unassigned', label: 'Nicht zugewiesen' },
  { value: 'unread', label: 'Ungelesen' },
  { value: 'expiring', label: 'Fenster läuft ab' },
];

function formatTime(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function windowCountdown(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return null;
  const hours = Math.floor(remaining / 3600_000);
  const mins = Math.floor((remaining % 3600_000) / 60_000);
  return `${hours}h ${mins}m`;
}

// Map conversation state to Badge tone (Badge uses `tone`, not `variant`)
const STATE_INFO: Record<string, { label: string; tone: 'success' | 'softAccent' | 'neutral' | 'accent' | 'outline' }> = {
  bot_active:   { label: 'Bot',          tone: 'softAccent' },
  human_active: { label: 'Mensch',       tone: 'success'    },
  waiting:      { label: 'Wartet',       tone: 'neutral'    },
  closed:       { label: 'Geschlossen',  tone: 'outline'    },
};

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  loading,
}: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Suche — Input wraps a div; use icon prop for leading icon */}
      <div className="p-3 border-b border-gray-200">
        <Input
          icon={<Search className="w-4 h-4" />}
          placeholder="Name oder Telefon suchen..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>

      {/* Filter */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-gray-200">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f.value
                ? 'bg-red-50 text-red-600'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Keine Konversationen</div>
        ) : (
          conversations.map(conv => {
            const c = conv as {
              id: string;
              state: string;
              window_expires_at: string | null;
              unread_count: number;
              last_message_at: string | null;
              assigned_to: string | null;
              candidate: { id: string; name: string; phone_e164: string | null };
              application: Array<{ job: { title: string } | null }> | null;
            };
            const stateInfo = STATE_INFO[c.state] ?? STATE_INFO.waiting;
            const countdown = windowCountdown(c.window_expires_at);
            const jobTitle = c.application?.[0]?.job?.title || '';

            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  selectedId === c.id ? 'bg-red-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {c.candidate?.name}
                      </span>
                      {c.unread_count > 0 && (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                    {jobTitle && (
                      <span className="text-xs text-gray-400 block truncate">{jobTitle}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-gray-400">{formatTime(c.last_message_at)}</span>
                    <Badge tone={stateInfo.tone}>{stateInfo.label}</Badge>
                  </div>
                </div>
                {countdown && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                    <Clock className="w-3 h-3" />
                    <span>{countdown}</span>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
