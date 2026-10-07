'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ConversationList } from '@/components/inbox/conversation-list';
import { ChatPane } from '@/components/inbox/chat-pane';
import { CandidateSidebar } from '@/components/inbox/candidate-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { createClient } from '@/lib/supabase/client';
import { MessageCircle } from 'lucide-react';
import type { InboxKind } from '@/components/inbox/format';

export default function InboxPage() {
  const [conversations, setConversations] = useState<Record<string, unknown>[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<InboxKind>('recruiting');
  // Sales-Inbox: Leads oder Kunden
  const [gruppe, setGruppe] = useState<'leads' | 'kunden'>('leads');
  // Kontakt-Details nur auf breiten Bildschirmen direkt offen, sonst verdecken sie den Chat
  const [showInfo, setShowInfo] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches);
  const deepLinkHandled = useRef(false);

  // C1: stable client instance — never re-created on render
  const supabase = useMemo(() => createClient(), []);

  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams({ filter, gruppe });
    if (search) params.set('search', search);
    const res = await fetch(`/api/conversations?${params}`);
    if (res.ok) {
      const data = await res.json();
      setConversations(Array.isArray(data) ? data : []);
      setKind(res.headers.get('x-inbox-kind') === 'sales' ? 'sales' : 'recruiting');
    }
    setLoading(false);
    // Deep-Link aus Push-Benachrichtigungen: /inbox?conversation=<id> einmalig öffnen
    if (!deepLinkHandled.current) {
      deepLinkHandled.current = true;
      const fromUrl = new URLSearchParams(window.location.search).get('conversation');
      if (fromUrl) setSelectedId(fromUrl);
    }
  }, [filter, search, gruppe]);

  const loadMessages = useCallback(async (convId: string) => {
    const res = await fetch(`/api/conversations/${convId}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } else {
      setMessages([]);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  // Keep a stable ref so realtime callbacks always call the latest version
  // without needing it in effect deps (avoids subscription churn).
  const loadConversationsRef = useRef(loadConversations);
  useEffect(() => { loadConversationsRef.current = loadConversations; }, [loadConversations]);

  // C2: Effect A — mount-only, stable. Subscribes to conversation INSERT+UPDATE
  // so the list refreshes whenever a conversation is created or last_message_at changes.
  useEffect(() => {
    const channel = supabase
      .channel('inbox-conversations')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversations',
      }, () => { loadConversationsRef.current(); })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
      }, () => { loadConversationsRef.current(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  // C3: Effect B — keyed on selectedId. Subscribes to message INSERTs for the
  // open conversation only, with a server-side filter (no cross-conversation noise).
  useEffect(() => {
    if (!selectedId) return;

    const channel = supabase
      .channel(`inbox-messages-${selectedId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedId}`,
      }, (payload) => {
        const newMsg = payload.new as Record<string, unknown>;
        setMessages(prev => {
          // Dedupe by id in case optimistic append already added it
          if (prev.some((m) => (m as { id: string }).id === (newMsg as { id: string }).id)) {
            return prev;
          }
          return [...prev, newMsg];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, selectedId]);

  const selectedConv = conversations.find((c) => (c as { id: string }).id === selectedId) || null;

  const unread = conversations.reduce((n, c) => n + ((c as { unread_count?: number }).unread_count ?? 0), 0);

  return (
    <div>
      <PageHeader
        title={kind === 'sales' ? 'Sales-WhatsApp' : 'Inbox'}
        description={
          kind === 'sales'
            ? 'Alle WhatsApp-Gespräche mit Leads und Kunden – neue Nummern landen automatisch im CRM.'
            : 'Alle WhatsApp-Gespräche mit deinen Bewerbern – neue Nummern landen automatisch im CRM.'
        }
        counter={unread > 0 ? `${unread} ungelesen` : undefined}
      />

      {kind === 'sales' && (
        <SegmentedControl
          className="mb-3"
          items={[
            { value: 'leads', label: 'Leads' },
            { value: 'kunden', label: 'Kunden' },
          ]}
          value={gruppe}
          onChange={(v) => {
            setGruppe(v as 'leads' | 'kunden');
            setSelectedId(null);
          }}
        />
      )}

      <div className="relative flex h-[calc(100dvh-300px)] min-h-[500px] overflow-hidden rounded-xl bg-card shadow-sm md:h-[calc(100dvh-268px)]">
        {/* Gesprächsliste (Handy: nur ohne offene Konversation) */}
        <div className={`${selectedId ? 'hidden lg:flex' : 'flex'} w-full flex-shrink-0 flex-col border-hair lg:w-[340px] lg:border-r`}>
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            loading={loading}
            kind={kind}
          />
        </div>

        {/* Chat */}
        <div className={`${selectedId ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col`}>
          {selectedId ? (
            <ChatPane
              conversationId={selectedId}
              messages={messages}
              conversation={selectedConv}
              onMessageSent={() => {
                loadMessages(selectedId);
                loadConversations();
              }}
              onBack={() => setSelectedId(null)}
              onToggleInfo={() => setShowInfo((v) => !v)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-panel/60 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-card text-red-800 shadow-sm">
                <MessageCircle className="h-6 w-6" />
              </span>
              <p className="text-[15px] font-medium">Wähle ein Gespräch aus</p>
              <p className="text-[13px] text-gray-600">Links findest du alle WhatsApp-Kontakte.</p>
            </div>
          )}
        </div>

        {/* Kontakt-Details: Desktop als Spalte, sonst als Schublade */}
        {selectedConv && showInfo && (
          <>
            <div className="absolute inset-0 z-10 bg-ink/20 xl:hidden" onClick={() => setShowInfo(false)} />
            <div className="absolute inset-y-0 right-0 z-20 w-[min(340px,92%)] overflow-y-auto border-l border-hair bg-card shadow-[-20px_0_40px_-30px_#1a151466] xl:static xl:z-auto xl:w-[320px] xl:shadow-none">
              <CandidateSidebar conversation={selectedConv} kind={kind} onChanged={loadConversations} onClose={() => setShowInfo(false)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
