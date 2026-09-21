'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';

interface QuickReply {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
}

interface Props {
  onSelect: (body: string) => void;
  onClose: () => void;
}

export function QuickReplyModal({ onSelect, onClose }: Props) {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/quick-replies')
      .then(r => {
        if (!r.ok) return [];
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) setReplies(data);
      });
  }, []);

  const filtered = replies.filter(r =>
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    (r.shortcut && r.shortcut.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Modal open onClose={onClose} title="Textbaustein wählen">
      <div className="space-y-3">
        <input
          autoFocus
          placeholder="Suchen..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        <div className="max-h-60 overflow-y-auto space-y-1">
          {filtered.map(r => (
            <button
              key={r.id}
              onClick={() => onSelect(r.body)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900">{r.title}</span>
              {r.shortcut && (
                <span className="text-xs text-gray-400 ml-2">/{r.shortcut}</span>
              )}
              <p className="text-xs text-gray-500 truncate mt-0.5">{r.body}</p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              Keine Textbausteine gefunden
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
