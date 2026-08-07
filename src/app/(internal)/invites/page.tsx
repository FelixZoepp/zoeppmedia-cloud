'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Building2, Mail, Phone, User, UserPlus, CheckCircle, Copy, AlertCircle } from 'lucide-react';

export default function InvitesPage() {
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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
  }

  function handleCopy() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <form onSubmit={handleSubmit} className="space-y-5">
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
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-[var(--radius-md)] text-[var(--text-sm)] text-red-600">
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
                  Einladungslink erstellt!
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
    </div>
  );
}
