'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TemplatePicker } from './template-picker';
import { QuickReplyModal } from './quick-reply-modal';
import { Send, Bot, User, Monitor, CheckCheck, Check, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  conversationId: string;
  messages: Record<string, unknown>[];
  conversation: Record<string, unknown> | null;
  onMessageSent: () => void;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  queued:    <span className="text-gray-300">&#x25cf;</span>,
  sent:      <Check className="w-3 h-3 text-gray-400" />,
  delivered: <CheckCheck className="w-3 h-3 text-gray-400" />,
  read:      <CheckCheck className="w-3 h-3 text-blue-500" />,
  failed:    <X className="w-3 h-3 text-red-500" />,
};

const SENDER_ICONS: Record<string, React.ReactNode> = {
  candidate: <User className="w-3.5 h-3.5" />,
  bot:       <Bot className="w-3.5 h-3.5" />,
  user:      <User className="w-3.5 h-3.5" />,
  system:    <Monitor className="w-3.5 h-3.5" />,
};

export function ChatPane({ conversationId, messages, conversation, onMessageSent }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conv = conversation as {
    state: string;
    window_expires_at: string | null;
    candidate: { name: string };
  } | null;

  const windowOpen = conv?.window_expires_at
    ? new Date(conv.window_expires_at).getTime() > Date.now()
    : false;
  const isClosed = !windowOpen;

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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">
          {conv?.candidate?.name || 'Chat'}
        </h3>
      </div>

      {/* Nachrichten */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(m => {
          const msg = m as {
            id: string;
            direction: string;
            sender_type: string;
            body: string | null;
            status: string;
            error_code: string | null;
            created_at: string;
          };
          const isOut = msg.direction === 'out';

          return (
            <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                isOut
                  ? msg.sender_type === 'bot'
                    ? 'bg-blue-50 text-blue-900'
                    : msg.sender_type === 'system'
                    ? 'bg-gray-100 text-gray-600 text-xs italic'
                    : 'bg-red-50 text-gray-900'
                  : 'bg-gray-100 text-gray-900'
              }`}>
                {/* Absender-Badge */}
                <div className="flex items-center gap-1 mb-0.5">
                  <span className={isOut ? 'text-gray-400' : 'text-gray-500'}>
                    {SENDER_ICONS[msg.sender_type]}
                  </span>
                  <span className="text-xs text-gray-400">
                    {msg.sender_type === 'bot'
                      ? 'Bot'
                      : msg.sender_type === 'system'
                      ? 'System'
                      : msg.sender_type === 'candidate'
                      ? ''
                      : 'Recruiter'}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-xs text-gray-400">
                    {new Date(msg.created_at).toLocaleTimeString('de-DE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {isOut && STATUS_ICONS[msg.status]}
                </div>
                {msg.status === 'failed' && msg.error_code && (
                  <p className="text-xs text-red-500 mt-1">{msg.error_code}</p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 p-3">
        {isClosed ? (
          <TemplatePicker onSend={handleTemplateSend} sending={sending} />
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                placeholder="Nachricht schreiben... (/ für Textbausteine)"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
              />
            </div>
            <Button onClick={handleSend} disabled={sending || !text.trim()} size="md">
              <Send className="w-4 h-4" />
            </Button>
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
