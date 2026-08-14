'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Copy, Check, User, Building2, Webhook, CalendarCheck, Pencil, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [agency, setAgency] = useState<{ name: string; email: string; phone: string | null; id: string; meta_ad_account_id: string | null; meta_page_id: string | null; calendly_link: string | null } | null>(null);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [calendlyLink, setCalendlyLink] = useState('');
  const [calendlySaving, setCalendlySaving] = useState(false);
  const [calendlySaved, setCalendlySaved] = useState(false);

  // Profile edit
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [nameSaving, setNameSaving] = useState(false);

  // Agency edit
  const [editingAgency, setEditingAgency] = useState(false);
  const [agencyName, setAgencyName] = useState('');
  const [agencyPhone, setAgencyPhone] = useState('');
  const [agencySaving, setAgencySaving] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

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
        setNameValue(profile.name);
        const { data: ag } = await supabase
          .from('agencies')
          .select('id, name, email, phone, meta_ad_account_id, meta_page_id, calendly_link')
          .eq('id', profile.agency_id)
          .single();
        if (ag) {
          setAgency(ag);
          setCalendlyLink(ag.calendly_link || '');
          setAgencyName(ag.name);
          setAgencyPhone(ag.phone || '');
        }
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
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

  async function saveName() {
    if (!nameValue.trim()) return;
    setNameSaving(true);
    const res = await fetch('/api/settings/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', name: nameValue.trim() }),
    });
    setNameSaving(false);
    if (res.ok) {
      setUser((prev) => prev ? { ...prev, name: nameValue.trim() } : prev);
      setEditingName(false);
      toast.success('Name gespeichert');
    } else {
      toast.error('Fehler beim Speichern');
    }
  }

  async function saveAgency() {
    setAgencySaving(true);
    const res = await fetch('/api/settings/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'agency', name: agencyName.trim(), phone: agencyPhone.trim() || null }),
    });
    setAgencySaving(false);
    if (res.ok) {
      setAgency((prev) => prev ? { ...prev, name: agencyName.trim(), phone: agencyPhone.trim() || null } : prev);
      setEditingAgency(false);
      toast.success('Agentur-Daten gespeichert');
    } else {
      toast.error('Fehler beim Speichern');
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwörter stimmen nicht überein');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }
    setPasswordSaving(true);

    // Re-authenticate with current password first
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser?.email) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authUser.email,
        password: currentPassword,
      });
      if (signInError) {
        toast.error('Aktuelles Passwort ist falsch');
        setPasswordSaving(false);
        return;
      }
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) {
      toast.error('Fehler: ' + error.message);
    } else {
      toast.success('Passwort geändert');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader label="EINSTELLUNGEN" title="Einstellungen" />

      {/* Profile */}
      <Card padding="md" className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <User className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Dein Profil</h2>
        </div>
        <div className="space-y-6 pl-12">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 w-16">Name</span>
            {editingName ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                <Button size="sm" variant="primary" onClick={saveName} disabled={nameSaving}>
                  {nameSaving ? 'Speichert...' : 'Speichern'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setEditingName(false); setNameValue(user?.name || ''); }}>
                  Abbrechen
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{user?.name}</span>
                <button
                  onClick={() => setEditingName(true)}
                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 w-16">E-Mail</span>
            <span className="text-sm font-medium text-gray-900">{user?.email}</span>
          </div>
        </div>
      </Card>

      {/* Agency */}
      <Card padding="md" className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-gray-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Agentur</h2>
          </div>
          {!editingAgency && (
            <button
              onClick={() => setEditingAgency(true)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="space-y-4 pl-12">
          {editingAgency ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                <Input
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefon</label>
                <Input
                  type="tel"
                  value={agencyPhone}
                  onChange={(e) => setAgencyPhone(e.target.value)}
                  placeholder="+49 ..."
                  className="w-full"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={saveAgency} disabled={agencySaving}>
                  {agencySaving ? 'Speichert...' : 'Speichern'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setEditingAgency(false); setAgencyName(agency?.name || ''); setAgencyPhone(agency?.phone || ''); }}>
                  Abbrechen
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-16">Name</span>
                <span className="text-sm font-medium text-gray-900">{agency?.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-16">E-Mail</span>
                <span className="text-sm font-medium text-gray-900">{agency?.email}</span>
              </div>
              {agency?.phone && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400 w-16">Telefon</span>
                  <span className="text-sm font-medium text-gray-900">{agency.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-16 shrink-0">Meta Ad</span>
                <span className="text-sm font-medium text-gray-900 font-mono">
                  {agency?.meta_ad_account_id || <span className="text-gray-400 font-sans font-normal">Nicht konfiguriert</span>}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-16 shrink-0">Meta Page</span>
                <span className="text-sm font-medium text-gray-900 font-mono">
                  {agency?.meta_page_id || <span className="text-gray-400 font-sans font-normal">Nicht konfiguriert</span>}
                </span>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Password Change */}
      <Card padding="md" className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <Lock className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Passwort ändern</h2>
        </div>
        <form onSubmit={changePassword} className="space-y-4 pl-12">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Aktuelles Passwort</label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="Aktuelles Passwort"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Neues Passwort</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="Mindestens 8 Zeichen"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Passwort bestätigen</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Passwort wiederholen"
            />
          </div>
          <Button type="submit" size="sm" variant="primary" disabled={passwordSaving}>
            {passwordSaving ? 'Wird geändert...' : 'Passwort ändern'}
          </Button>
        </form>
      </Card>

      {/* Calendly */}
      <Card padding="md" className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <CalendarCheck className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Calendly</h2>
            <p className="text-sm text-gray-400">Buchungslink für Bewerber-Termine</p>
          </div>
        </div>
        <div className="space-y-4 pl-12">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Calendly Booking-Link
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="url"
                value={calendlyLink}
                onChange={(e) => {
                  setCalendlyLink(e.target.value);
                  setCalendlySaved(false);
                }}
                placeholder="https://calendly.com/dein-name/vorstellungsgespraech"
                className="flex-1"
              />
              <Button
                variant="primary"
                size="sm"
                disabled={calendlySaving}
                onClick={async () => {
                  if (!agency) return;
                  setCalendlySaving(true);
                  await supabase
                    .from('agencies')
                    .update({ calendly_link: calendlyLink || null })
                    .eq('id', agency.id);
                  setCalendlySaving(false);
                  setCalendlySaved(true);
                  toast.success('Calendly-Link gespeichert');
                  setTimeout(() => setCalendlySaved(false), 2000);
                }}
              >
                {calendlySaved ? <Check className="w-4 h-4 text-green-200" /> : null}
                {calendlySaving ? 'Speichert...' : calendlySaved ? 'Gespeichert' : 'Speichern'}
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Dieser Link wird Bewerbern zur Terminbuchung angezeigt.
            </p>
          </div>
        </div>
      </Card>

      {/* Webhook */}
      <Card padding="md">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
            <Webhook className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Meta Webhook URL</h2>
            <p className="text-sm text-gray-400">Bei Meta Lead Ads als Webhook hinterlegen</p>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <code className="text-xs text-gray-900 font-mono break-all flex-1">{webhookUrl}</code>
          <Button variant="secondary" size="sm" onClick={handleCopy} pill>
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Kopiert' : 'Kopieren'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
