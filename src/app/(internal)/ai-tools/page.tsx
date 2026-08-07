'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import type { AIConversation, AIMessage } from '@/lib/types/database';
import {
  Send, Plus, MessageSquare, Sparkles, Building2,
  FileText, PhoneCall, Globe, Bot, User,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const CONTENT_TYPES = [
  { value: 'ad_copy', label: 'Ad Copy' },
  { value: 'script', label: 'Telefon-Skript' },
  { value: 'funnel_text', label: 'Funnel-Texte' },
  { value: 'general', label: 'Allgemein' },
];

const CONTENT_ICONS: Record<string, React.ReactNode> = {
  ad_copy: <FileText className="w-4 h-4" />,
  script: <PhoneCall className="w-4 h-4" />,
  funnel_text: <Globe className="w-4 h-4" />,
  general: <MessageSquare className="w-4 h-4" />,
};

/* ------------------------------------------------------------------ */
/*  Conversation Sidebar Item                                         */
/* ------------------------------------------------------------------ */

function ConversationItem({
  conversation,
  active,
  onClick,
}: {
  conversation: AIConversation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer ${
        active
          ? 'bg-red-50 border border-red-200 text-red-600'
          : 'text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] border border-transparent'
      }`}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span className={`flex-shrink-0 ${active ? 'text-red-500' : 'text-[var(--text-tertiary)]'}`}>
          {CONTENT_ICONS[conversation.conversation_type] || <MessageSquare className="w-4 h-4" />}
        </span>
        <span className="text-[14px] font-medium truncate flex-1">
          {conversation.title || 'Neue Unterhaltung'}
        </span>
      </div>
      <div className="flex items-center gap-2 pl-6">
        <span className="text-[11px] text-[var(--text-tertiary)]">
          {new Date(conversation.updated_at).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
          })}
        </span>
        <Badge tone="outline" className="!text-[10px] !px-1.5 !py-0">
          {CONTENT_TYPES.find((t) => t.value === conversation.conversation_type)?.label || conversation.conversation_type}
        </Badge>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Chat Message Bubble                                               */
/* ------------------------------------------------------------------ */

function ChatBubble({ message }: { message: AIMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex items-start gap-2.5 max-w-[85%] ${isUser ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isUser
              ? 'bg-gradient-to-b from-[#EF5B6F] to-red-500 text-white'
              : 'bg-[var(--surface-inset)] text-[var(--text-secondary)]'
          }`}
        >
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>

        {/* Bubble */}
        <div
          className={`rounded-[var(--radius-lg)] px-4 py-3 ${
            isUser
              ? 'bg-gradient-to-br from-[#EF5B6F] to-red-500 text-white shadow-[var(--shadow-accent)]'
              : 'bg-white text-[var(--text-primary)] shadow-[var(--shadow-sm)] border border-[var(--border-default)]'
          }`}
        >
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
          <p
            className={`text-[11px] mt-2 ${
              isUser ? 'text-white/60' : 'text-[var(--text-tertiary)]'
            }`}
          >
            {new Date(message.created_at).toLocaleTimeString('de-DE', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                         */
/* ------------------------------------------------------------------ */

export default function AIToolsPage() {
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // New conversation settings
  const [selectedAgency, setSelectedAgency] = useState('');
  const [selectedType, setSelectedType] = useState<string>('general');

  // Message input
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Agencies for selection
  const [agencies, setAgencies] = useState<{ value: string; label: string }[]>([]);

  /* ---- Fetch agencies ---- */

  useEffect(() => {
    fetch('/api/admin/agencies')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAgencies([
            { value: '', label: 'Agentur wählen...' },
            ...data.map((a: { id: string; name: string }) => ({ value: a.id, label: a.name })),
          ]);
        }
      })
      .catch(() => {});
  }, []);

  /* ---- Fetch conversations ---- */

  const fetchConversations = useCallback(() => {
    fetch('/api/ai/chat')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setConversations(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  /* ---- Fetch messages for active conversation ---- */

  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    fetch(`/api/ai/chat?conversation_id=${activeConvId}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((data) => {
        if (data.messages && Array.isArray(data.messages)) {
          setMessages(data.messages);
        } else if (Array.isArray(data)) {
          setMessages(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMessages(false));
  }, [activeConvId]);

  /* ---- Scroll to bottom on new messages ---- */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ---- Send message ---- */

  async function sendMessage() {
    if (!inputText.trim() || sending) return;
    setSending(true);

    const body: Record<string, string> = {
      message: inputText.trim(),
      content_type: selectedType,
    };
    if (activeConvId) body.conversation_id = activeConvId;
    if (selectedAgency) body.agency_id = selectedAgency;

    // Optimistic user message
    const tempUserMsg: AIMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConvId || '',
      role: 'user',
      content: inputText.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInputText('');

    // Auto-resize textarea back
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();

        // If a new conversation was created, update state
        if (data.conversation && !activeConvId) {
          setActiveConvId(data.conversation.id);
          setConversations((prev) => [data.conversation, ...prev]);
        }

        // Add assistant response
        if (data.message) {
          setMessages((prev) => [
            ...prev.filter((m) => !m.id.startsWith('temp-')),
            ...(data.userMessage ? [data.userMessage] : [tempUserMsg]),
            data.message,
          ]);
        }
      }
    } catch {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  }

  /* ---- New conversation ---- */

  function startNewConversation() {
    setActiveConvId(null);
    setMessages([]);
    setSelectedType('general');
  }

  /* ---- Group conversations by agency ---- */

  const grouped = conversations.reduce<Record<string, AIConversation[]>>((acc, conv) => {
    const key = conv.agency_id || 'no_agency';
    if (!acc[key]) acc[key] = [];
    acc[key].push(conv);
    return acc;
  }, {});

  /* ---- Auto-resize textarea ---- */

  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputText(e.target.value);
    e.target.style.height = '44px';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  }

  /* ---- Loading state ---- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  /* ---- Render ---- */

  return (
    <div>
      <PageHeader label="FULFILLMENT" title="AI Tools" />
    <div className="flex gap-6 h-[calc(100vh-128px)]">
      {/* Left Sidebar: Conversations */}
      <div className="w-[280px] flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Unterhaltungen</h2>
          <Button variant="soft" size="sm" onClick={startNewConversation}>
            <Plus className="w-3.5 h-3.5" /> Neu
          </Button>
        </div>

        <Card padding="sm" className="flex-1 overflow-y-auto !p-2">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6 text-red-500" />
              </div>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Starte eine neue Unterhaltung
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {Object.entries(grouped).map(([agencyId, convs]) => {
                const agencyLabel = agencies.find((a) => a.value === agencyId)?.label || (agencyId === 'no_agency' ? 'Allgemein' : agencyId.slice(0, 8));
                return (
                  <div key={agencyId}>
                    <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                      <Building2 className="w-3 h-3" />
                      {agencyLabel}
                    </div>
                    {convs.map((conv) => (
                      <ConversationItem
                        key={conv.id}
                        conversation={conv}
                        active={activeConvId === conv.id}
                        onClick={() => setActiveConvId(conv.id)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Right Main: Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar: Agency + Content Type selection */}
        <div className="flex items-center gap-3 mb-6">
          <Select
            options={agencies.length > 0 ? agencies : [{ value: '', label: 'Lade Agenturen...' }]}
            value={selectedAgency}
            onChange={(e) => setSelectedAgency(e.target.value)}
            className="w-[220px]"
          />
          <Select
            options={CONTENT_TYPES}
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-[180px]"
          />
          <div className="flex-1" />
          {activeConvId && (
            <Badge tone="softAccent" className="flex-shrink-0">
              <Sparkles className="w-3 h-3 mr-1" />
              AI Chat aktiv
            </Badge>
          )}
        </div>

        {/* Messages area */}
        <Card padding="md" className="flex-1 overflow-y-auto mb-5 !p-6">
          {!activeConvId && messages.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-gradient-to-b from-[#EF5B6F] to-red-500 flex items-center justify-center mb-4 shadow-[var(--shadow-accent)]">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-[20px] font-bold text-[var(--text-primary)] mb-2">
                AI Content Tools
              </h3>
              <p className="text-[var(--text-secondary)] text-[15px] max-w-sm leading-relaxed mb-6">
                Generiere und verfeinere Ad Copys, Skripte und Funnel-Texte mit AI-Unterstützung.
              </p>
              <div className="grid grid-cols-2 gap-3 max-w-md w-full">
                {CONTENT_TYPES.filter((t) => t.value !== 'general').map((t) => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setSelectedType(t.value);
                      textareaRef.current?.focus();
                    }}
                    className="flex items-center gap-3 p-4 bg-[var(--surface-subtle)] rounded-[var(--radius-md)] text-left hover:bg-red-50 hover:text-red-600 transition-colors border border-transparent hover:border-red-200 cursor-pointer group"
                  >
                    <span className="text-[var(--text-tertiary)] group-hover:text-red-500 transition-colors">
                      {CONTENT_ICONS[t.value]}
                    </span>
                    <span className="text-[14px] font-medium">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : loadingMessages ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div>
              {messages.map((msg) => (
                <ChatBubble key={msg.id} message={msg} />
              ))}

              {sending && (
                <div className="flex justify-start mb-4">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[var(--surface-inset)] flex items-center justify-center">
                      <Bot className="w-4 h-4 text-[var(--text-secondary)]" />
                    </div>
                    <div className="bg-white rounded-[var(--radius-lg)] px-4 py-3 shadow-[var(--shadow-sm)] border border-[var(--border-default)]">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </Card>

        {/* Chat Composer */}
        <div className="flex items-end gap-3">
          <div className="flex-1 relative bg-white border border-gray-200 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden focus-within:border-red-300 focus-within:shadow-[var(--focus-ring)] transition-all">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleTextareaInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={
                selectedType === 'ad_copy'
                  ? 'Erstelle 3 Ad Copys für...'
                  : selectedType === 'script'
                  ? 'Erstelle ein Telefon-Skript für...'
                  : selectedType === 'funnel_text'
                  ? 'Schreibe Funnel-Texte für...'
                  : 'Schreibe eine Nachricht...'
              }
              rows={1}
              className="w-full px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none resize-none bg-transparent"
              style={{ minHeight: '44px', maxHeight: '160px' }}
            />
          </div>
          <Button
            onClick={sendMessage}
            disabled={!inputText.trim() || sending}
            glow={!!inputText.trim()}
            className="h-[44px] !px-5"
          >
            {sending ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
    </div>
  );
}
