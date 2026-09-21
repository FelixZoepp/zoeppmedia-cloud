'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ConversationList } from '@/components/inbox/conversation-list';
import { ChatPane } from '@/components/inbox/chat-pane';
import { CandidateSidebar } from '@/components/inbox/candidate-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/client';

export default function InboxPage() {
  const [conversations, setConversations] = useState<Record<string, unknown>[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams({ filter });
    if (search) params.set('search', search);
    const res = await fetch(`/api/conversations?${params}`);
    if (res.ok) {
      const data = await res.json();
      setConversations(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, [filter, search]);

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

  // Supabase Realtime für Live-Updates
  useEffect(() => {
    const channel = supabase
      .channel('inbox-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const newMsg = payload.new as Record<string, unknown>;
        // Update messages if current conversation
        if (selectedId && newMsg.conversation_id === selectedId) {
          setMessages(prev => [...prev, newMsg]);
        }
        // Refresh conversation list
        loadConversations();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
      }, () => {
        loadConversations();
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [supabase, selectedId, loadConversations]);

  const selectedConv = conversations.find((c) => (c as { id: string }).id === selectedId) || null;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <PageHeader label="KOMMUNIKATION" title="Inbox" />

      <div className="flex flex-1 min-h-0 border-t border-gray-200">
        {/* Linke Spalte: Gesprächsliste */}
        <div className="w-80 border-r border-gray-200 flex-shrink-0 overflow-y-auto">
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            loading={loading}
          />
        </div>

        {/* Mitte: Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedId ? (
            <ChatPane
              conversationId={selectedId}
              messages={messages}
              conversation={selectedConv}
              onMessageSent={() => {
                loadMessages(selectedId);
                loadConversations();
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Wähle eine Konversation aus
            </div>
          )}
        </div>

        {/* Rechte Spalte: Bewerber-Sidebar */}
        {selectedConv && (
          <div className="w-80 border-l border-gray-200 flex-shrink-0 overflow-y-auto">
            <CandidateSidebar conversation={selectedConv} />
          </div>
        )}
      </div>
    </div>
  );
}
