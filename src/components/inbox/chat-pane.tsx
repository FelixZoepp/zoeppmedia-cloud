'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TemplatePicker } from './template-picker';
import { QuickReplyModal } from './quick-reply-modal';
import { Send, Bot, CheckCheck, Check, X, Paperclip, Sparkles, ChevronLeft, Info } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { formatPhone } from './format';
import { toast } from 'sonner';

interface Props {
  conversationId: string;
  messages: Record<string, unknown>[];
  conversation: Record<string, unknown> | null;
  onMessageSent: () => void;
  /** Handy: zurück zur Liste */
  onBack?: () => void;
  /** Kontakt-Details ein-/ausblenden */
  onToggleInfo?: () => void;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const heute = new Date();
  const gestern = new Date();
  gestern.setDate(heute.getDate() - 1);
  if (d.toDateString() === heute.toDateString()) return 'Heute';
  if (d.toDateString() === gestern.toDateString()) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  queued:    <span className="opacity-60">&#x25cf;</span>,
  sent:      <Check className="w-3 h-3 opacity-70" />,
  delivered: <CheckCheck className="w-3 h-3 opacity-70" />,
  read:      <CheckCheck className="w-3 h-3 text-sky-300" />,
  failed:    <X className="w-3 h-3 text-red-500" />,
};


export function ChatPane({ conversationId, messages, conversation, onMessageSent, onBack, onToggleInfo }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const conv = conversation as {
    state: string;
    window_expires_at: string | null;
    candidate: { name: string; phone_e164?: string | null; current_stage?: { name: string; color: string | null } | null };
    application?: Array<{ id: string }> | null;
  } | null;

  const isOptedOut = conv?.state === 'closed';
  const windowOpen = conv?.window_expires_at
    ? new Date(conv.window_expires_at).getTime() > Date.now()
    : false;
  const isClosed = !windowOpen;
  const isBotActive = conv?.state === 'bot_active';
  const isHumanActive = conv?.state === 'human_active';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          type: 'text',
          body: text.trim(),
        }),
      });
      const result = await res.json();
      if (result.ok) {
        setText('');
        onMessageSent();
      } else {
        toast.error(result.error || 'Senden fehlgeschlagen');
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === '/' && text === '') {
      e.preventDefault();
      setShowQuickReplies(true);
    }
  }

  async function handleTemplateSend(templateId: string, variables: Record<string, string>) {
    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          type: 'template',
          templateId,
          templateVariables: variables,
        }),
      });
      const result = await res.json();
      if (result.ok) {
        onMessageSent();
        toast.success('Vorlage gesendet');
      } else {
        toast.error(result.error || 'Senden fehlgeschlagen');
      }
    } finally {
      setSending(false);
    }
  }

  async function handleSuggest() {
    setSuggesting(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/suggest`, {
        method: 'POST',
      });
      const result = await res.json();
      if (res.ok && result.suggestion) {
        setText(result.suggestion);
      } else {
        toast.error(result.error || 'KI-Vorschlag fehlgeschlagen');
      }
    } finally {
      setSuggesting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = '';

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/conversations/${conversationId}/upload`, {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      if (result.ok) {
        // Realtime liefert die neue Nachricht — kein manuelles Nachladen nötig
        toast.success('Datei gesendet');
      } else {
        toast.error(result.error || 'Upload fehlgeschlagen');
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleBotToggle(newState: 'bot_active' | 'human_active') {
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState }),
      });
      const result = await res.json();
      if (!result.ok) {
        toast.error(result.error || 'Status-Änderung fehlgeschlagen');
      } else {
        onMessageSent(); // Seite aktualisieren
      }
    } catch {
      toast.error('Status-Änderung fehlgeschlagen');
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Kopf: Kontakt + Bot-Status */}
      <div className="flex items-center gap-3 border-b border-hair px-3 py-3 md:px-4">
        {onBack && (
          <button onClick={onBack} className="grid h-10 w-10 flex-none place-items-center rounded-full hover:bg-panel lg:hidden" aria-label="Zurück zur Liste">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <button onClick={onToggleInfo} className="flex min-w-0 flex-1 items-center gap-3 text-left" title="Kontakt-Details">
          <Avatar name={conv?.candidate?.name || '?'} size={42} />
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-medium">{conv?.candidate?.name || 'Chat'}</span>
            <span className="block truncate text-[13px] text-gray-600">
              {formatPhone(conv?.candidate?.phone_e164)}
              {conv?.candidate?.current_stage ? ` · ${conv.candidate.current_stage.name}` : ''}
            </span>
          </span>
        </button>
        <div className="flex flex-none items-center gap-2">
          {isBotActive && (
            <>
              <span className="hidden items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 sm:inline-flex">
                <Bot className="h-3 w-3" /> Bot aktiv
              </span>
              <Button size="sm" variant="secondary" onClick={() => handleBotToggle('human_active')} aria-label="Bot pausieren" className="px-3 sm:px-4">
                <Bot /> <span className="hidden sm:inline">Bot pausieren</span>
              </Button>
            </>
          )}
          {isHumanActive && (
            <Button size="sm" variant="secondary" onClick={() => handleBotToggle('bot_active')} aria-label="Bot fortsetzen" className="px-3 sm:px-4">
              <Bot /> <span className="hidden sm:inline">Bot fortsetzen</span>
            </Button>
          )}
          {onToggleInfo && (
            <button onClick={onToggleInfo} className="grid h-10 w-10 place-items-center rounded-full hover:bg-panel" aria-label="Kontakt-Details">
              <Info className="h-5 w-5 text-gray-600" />
            </button>
          )}
        </div>
      </div>

      {/* Nachrichten */}
      <div className="flex-1 space-y-2 overflow-y-auto bg-panel/60 px-3 py-4 md:px-6">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-gray-500">Noch keine Nachrichten</p>}
        {messages.map((m, i) => {
          const msg = m as {
            id: string;
            direction: string;
            sender_type: string;
            body: string | null;
            status: string;
            error_code: string | null;
            created_at: string;
          };
          const prev = messages[i - 1] as { created_at: string } | undefined;
          const neuerTag = !prev || new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString();
          const isOut = msg.direction === 'out';
          const system = msg.sender_type === 'system';
          const bot = msg.sender_type === 'bot';

          return (
            <div key={msg.id}>
              {neuerTag && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-gray-600 shadow-[0_0_0_1px_var(--hair)]">{dayLabel(msg.created_at)}</span>
                </div>
              )}
              {system ? (
                <p className="mx-auto max-w-[80%] py-1 text-center text-xs italic text-gray-500">{msg.body}</p>
              ) : (
                <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[78%] px-4 py-2.5 shadow-sm md:max-w-[65%] ${
                      isOut
                        ? bot
                          ? 'rounded-[18px] rounded-br-[6px] bg-sky-50 text-sky-950'
                          : 'rounded-[18px] rounded-br-[6px] bg-gradient-to-b from-red-800 to-red-950 text-red-50'
                        : 'rounded-[18px] rounded-bl-[6px] bg-card text-ink'
                    }`}
                  >
                    {bot && (
                      <span className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-sky-700">
                        <Bot className="h-3 w-3" /> Bot
                      </span>
                    )}
                    <p className="whitespace-pre-wrap break-words text-[14.5px] leading-snug">{msg.body}</p>
                    <div className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${isOut && !bot ? 'text-red-200' : 'text-gray-500'}`}>
                      {new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      {isOut && STATUS_ICONS[msg.status]}
                    </div>
                    {msg.status === 'failed' && msg.error_code && <p className="mt-1 text-xs text-red-300">Fehler: {msg.error_code}</p>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-hair p-3">
        {isOptedOut ? (
          <p className="text-sm text-gray-500 text-center py-2">
            Konversation geschlossen — Kandidat hat sich abgemeldet oder das Gespräch wurde beendet.
          </p>
        ) : isClosed ? (
          <TemplatePicker onSend={handleTemplateSend} sending={sending} />
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {/* Verstecktes File-Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              {/* Büroklammer-Button */}
              <Button
                size="md"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || sending}
                title="Datei senden"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <div className="flex-1">
                <Input
                  pill
                  placeholder="Nachricht schreiben … ( / für Textbausteine)"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                />
              </div>
              {/* KI-Vorschlag */}
              <Button
                size="md"
                variant="secondary"
                onClick={handleSuggest}
                disabled={suggesting || sending}
                title="KI-Vorschlag"
              >
                {suggesting ? (
                  <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span className="ml-1 hidden text-xs 2xl:inline">KI-Vorschlag</span>
              </Button>
              <Button onClick={handleSend} disabled={sending || !text.trim()} size="md">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Quick-Reply-Modal */}
      {showQuickReplies && (
        <QuickReplyModal
          onSelect={(body) => {
            setText(body);
            setShowQuickReplies(false);
          }}
          onClose={() => setShowQuickReplies(false)}
        />
      )}
    </div>
  );
}
