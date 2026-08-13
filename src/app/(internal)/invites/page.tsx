'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import {
  Building2,
  Mail,
  Phone,
  User,
  UserPlus,
  CheckCircle,
  Copy,
  AlertCircle,
  RefreshCw,
  Send,
} from 'lucide-react';

type AgencyWithInvite = {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  created_at: string;
  // joined from invite_tokens
  invite_token?: string;
  email_sent_at?: string | null;
  invite_redeemed?: boolean;
};

export default function InvitesPage() {
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [agencies, setAgencies] = useState<AgencyWithInvite[]>([]);
  const [invites, setInvites] = useState<Record<string, { token: string; email_sent_at: string | null; redeemed: boolean }>>({});
  const [listLoading, setListLoading] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const loadAgencies = useCallback(async () => {
    setListLoading(true);
    try {
      const [agenciesRes, invitesRes] = await Promise.all([
        fetch('/api/admin/agencies'),
        fetch('/api/admin/invites'),
      ]);
      if (agenciesRes.ok) {
        const data: AgencyWithInvite[] = await agenciesRes.json();
        setAgencies(data);
      }
      if (invitesRes.ok) {
        const data: { agency_id: string; token: string; email_sent_at: string | null; redeemed: boolean }[] = await invitesRes.json();
        const map: Record<string, { token: string; email_sent_at: string | null; redeemed: boolean }> = {};
        data.forEach((inv) => { map[inv.agency_id] = inv; });
        setInvites(map);
      }
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgencies();
  }, [loadAgencies]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInviteUrl('');

    const res = await fetch('/api/admin/agencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contact_name: contactName, email, phone }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error);
      setLoading(false);
      return;
    }

    setInviteUrl(data.invite_url);
    setName('');
    setContactName('');
    setEmail('');
    setPhone('');
    setLoading(false);
    await loadAgencies();
  }

  function handleCopy() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleResend(agency: AgencyWithInvite) {
    setResendingId(agency.id);
    try {
      await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency_id: agency.id, agency_name: agency.name, email: agency.email }),
      });
      await loadAgencies();
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        label="VERWALTUNG"
        title="Neue Agentur einladen"
        description="Erstelle einen Einladungslink für eine neue Agentur"
      />

      <div className="max-w-lg">
        <Card padding="lg">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <label
                htmlFor="name"
                className="block text-[var(--text-sm)] font-semibold text-[var(--text-primary)] mb-2"
              >
                Agenturname
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="z.B. Solar Solutions GmbH"
                icon={<Building2 size={18} />}
              />
            </div>

            <div>
              <label
                htmlFor="contact"
                className="block text-[var(--text-sm)] font-semibold text-[var(--text-primary)] mb-2"
              >
                Ansprechpartner
              </label>
              <Input
                id="contact"
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
                placeholder="Max Mustermann"
                icon={<User size={18} />}
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-[var(--text-sm)] font-semibold text-[var(--text-primary)] mb-2"
              >
                E-Mail
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="max@example.com"
                icon={<Mail size={18} />}
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-[var(--text-sm)] font-semibold text-[var(--text-primary)] mb-2"
              >
                Telefon
                <span className="font-normal text-[var(--text-tertiary)] ml-1">(optional)</span>
              </label>
              <Input
                id="phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+49 170 1234567"
                icon={<Phone size={18} />}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-6 py-4 bg-red-50 border border-red-200 rounded-[var(--radius-md)] text-[var(--text-sm)] text-red-600">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              size="lg"
              className="w-full"
            >
              <UserPlus size={18} />
              {loading ? 'Wird erstellt...' : 'Agentur erstellen & Link generieren'}
            </Button>
          </form>
        </Card>

        {inviteUrl && (
          <Card padding="md" className="mt-6 !bg-green-100/60 border border-green-500/20">
            <div className="flex items-start gap-3">
              <CheckCircle size={20} className="text-green-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[var(--text-sm)] font-semibold text-green-700 mb-2">
                  Einladungslink erstellt & E-Mail gesendet!
                </p>
                <code className="block text-[var(--text-sm)] text-green-700/80 break-all font-[var(--font-mono)] bg-green-100 rounded-[var(--radius-sm)] px-3 py-2">
                  {inviteUrl}
                </code>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={handleCopy}
                >
                  <Copy size={14} />
                  {copied ? 'Kopiert!' : 'Link kopieren'}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Agency list with invite status */}
      <div className="mt-8 max-w-5xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[var(--text-base)] font-semibold text-[var(--text-primary)]">
            Eingeladene Agenturen
          </h2>
          <Button variant="secondary" size="sm" onClick={loadAgencies} disabled={listLoading}>
            <RefreshCw size={14} className={listLoading ? 'animate-spin' : ''} />
            Aktualisieren
          </Button>
        </div>

        {listLoading ? (
          <p className="text-[var(--text-sm)] text-[var(--text-tertiary)]">Lädt...</p>
        ) : agencies.length === 0 ? (
          <p className="text-[var(--text-sm)] text-[var(--text-tertiary)]">Noch keine Agenturen eingeladen.</p>
        ) : (
          <div className="space-y-5">
            {agencies.map((agency) => {
              const inv = invites[agency.id];
              const emailSent = inv?.email_sent_at;
              const redeemed = inv?.redeemed;

              return (
                <Card key={agency.id} padding="md">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)]">
                          {agency.name}
                        </span>
                        {redeemed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <CheckCircle size={11} />
                            Registriert
                          </span>
                        ) : emailSent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            <Send size={11} />
                            E-Mail gesendet
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            Kein E-Mail
                          </span>
                        )}
                      </div>
                      <p className="text-[var(--text-sm)] text-[var(--text-tertiary)] mt-0.5">
                        {agency.contact_name} · {agency.email}
                      </p>
                      {emailSent && (
                        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                          Gesendet: {new Date(emailSent).toLocaleString('de-DE')}
                        </p>
                      )}
                    </div>
                    {!redeemed && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleResend(agency)}
                        disabled={resendingId === agency.id}
                      >
                        <Send size={13} />
                        {resendingId === agency.id ? 'Sendet...' : 'Erneut senden'}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
