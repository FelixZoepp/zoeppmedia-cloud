'use client';

import { Search, Clock, Sparkles } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { formatListTime, formatPhone, isNewFromWhatsApp, previewText, windowCountdown, type InboxConversation, type InboxKind } from './format';

interface Props {
  conversations: Record<string, unknown>[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: string;
  onFilterChange: (f: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  loading: boolean;
  kind?: InboxKind;
}

const FILTERS = [
  { value: 'all', label: 'Alle' },
  { value: 'unread', label: 'Ungelesen' },
  { value: 'mine', label: 'Mir zugewiesen' },
  { value: 'unassigned', label: 'Nicht zugewiesen' },
  { value: 'expiring', label: 'Fenster läuft ab' },
];

export function ConversationList({ conversations, selectedId, onSelect, filter, onFilterChange, search, onSearchChange, loading, kind = 'recruiting' }: Props) {
  const list = conversations as unknown as InboxConversation[];
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Name, Nummer oder E-Mail"
            aria-label="Konversationen durchsuchen"
            className="h-11 w-full rounded-full bg-panel pl-11 pr-4 text-[14.5px] outline-none placeholder:text-gray-500 focus-visible:shadow-[var(--focus)]"
          />
        </div>
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilterChange(f.value)}
              className={`flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                filter === f.value ? 'bg-gradient-to-b from-red-700 to-red-950 text-red-50' : 'bg-panel text-gray-600 hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-red-200 border-t-red-700" />
          </div>
        ) : list.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">{search ? 'Kein Treffer' : 'Noch keine Gespräche'}</p>
        ) : (
          list.map((c) => {
            const countdown = windowCountdown(c.window_expires_at);
            const stage = c.candidate?.current_stage ?? c.application?.[0]?.stage ?? null;
            const neu = c.candidate && isNewFromWhatsApp(c.candidate);
            const unread = c.unread_count > 0;
            const aktiv = selectedId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`flex w-full gap-3 rounded-[16px] px-2.5 py-3 text-left transition-colors ${aktiv ? 'bg-red-50' : 'hover:bg-panel'}`}
              >
                <span className="relative flex-none">
                  <Avatar name={c.candidate?.name ?? '?'} size={46} />
                  {unread && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-red-600 shadow-[0_0_0_2.5px_var(--card)]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={`min-w-0 flex-1 truncate text-[15px] ${unread ? 'font-semibold' : 'font-medium'}`}>{c.candidate?.name}</span>
                    <span className={`flex-none text-xs ${unread ? 'font-semibold text-red-700' : 'text-gray-500'}`}>
                      {formatListTime(c.last_message?.created_at ?? c.last_message_at)}
                    </span>
                  </span>
                  <span className="block truncate text-[12.5px] text-gray-500">{formatPhone(c.candidate?.phone_e164)}</span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate text-[13.5px] ${unread ? 'text-ink' : 'text-gray-600'}`}>
                      {previewText(c.last_message) || <span className="italic text-gray-400">Keine Nachrichten</span>}
                    </span>
                    {unread && (
                      <span className="grid h-5 min-w-[20px] flex-none place-items-center rounded-full bg-red-700 px-1.5 text-[11px] font-bold text-white">
                        {c.unread_count}
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {neu ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        <Sparkles className="h-3 w-3" /> Neu aus WhatsApp
                      </span>
                    ) : stage ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-[11px] font-medium text-gray-700">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: stage.color || '#a69f9b' }} />
                        {stage.name}
                      </span>
                    ) : null}
                    {kind === 'sales' && !neu && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800">Lead</span>}
                    {c.state === 'bot_active' && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">Bot</span>}
                    {countdown && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
                        <Clock className="h-3 w-3" /> {countdown}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
