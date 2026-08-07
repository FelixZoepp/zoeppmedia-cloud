'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Copy, Check, User, Building2, Webhook } from 'lucide-react';

export default function SettingsPage() {
  const [agency, setAgency] = useState<{ name: string; email: string; phone: string | null; id: string } | null>(null);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data: profile } = await supabase
        .from('users')
        .select('name, email, agency_id')
        .eq('id', authUser.id)
        .single();

      if (profile) {
        setUser({ name: profile.name, email: profile.email });
        const { data: ag } = await supabase
          .from('agencies')
          .select('id, name, email, phone')
          .eq('id', profile.agency_id)
          .single();
        if (ag) setAgency(ag);
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  const webhookUrl = agency
    ? `${window.location.origin}/api/webhooks/meta?agency=${agency.id}`
    : '';

  function handleCopy() {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-xl">
      <PageHeader label="EINSTELLUNGEN" title="Einstellungen" />

      <Card padding="md" className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--surface-inset)] flex items-center justify-center">
            <User className="w-5 h-5 text-[var(--text-secondary)]" />
          </div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Dein Profil</h2>
        </div>
        <div className="space-y-2 pl-12">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[var(--text-tertiary)] w-16">Name</span>
            <span className="text-[15px] font-medium text-[var(--text-primary)]">{user?.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[var(--text-tertiary)] w-16">E-Mail</span>
            <span className="text-[15px] font-medium text-[var(--text-primary)]">{user?.email}</span>
          </div>
        </div>
      </Card>

      <Card padding="md" className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--surface-inset)] flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[var(--text-secondary)]" />
          </div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Agentur</h2>
        </div>
        <div className="space-y-2 pl-12">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[var(--text-tertiary)] w-16">Name</span>
            <span className="text-[15px] font-medium text-[var(--text-primary)]">{agency?.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[var(--text-tertiary)] w-16">E-Mail</span>
            <span className="text-[15px] font-medium text-[var(--text-primary)]">{agency?.email}</span>
          </div>
          {agency?.phone && (
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-[var(--text-tertiary)] w-16">Telefon</span>
              <span className="text-[15px] font-medium text-[var(--text-primary)]">{agency.phone}</span>
            </div>
          )}
        </div>
      </Card>

      <Card padding="md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-red-50 flex items-center justify-center">
            <Webhook className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Meta Webhook URL</h2>
            <p className="text-[13px] text-[var(--text-tertiary)]">Bei Meta Lead Ads als Webhook hinterlegen</p>
          </div>
        </div>
        <div className="bg-[var(--surface-subtle)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-3 flex items-center gap-3">
          <code className="text-[13px] text-[var(--text-primary)] font-mono break-all flex-1">{webhookUrl}</code>
          <Button variant="secondary" size="sm" onClick={handleCopy} pill>
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Kopiert' : 'Kopieren'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
