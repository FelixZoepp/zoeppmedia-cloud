'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileUpload } from '@/components/file-upload';
import { User, Lock, Building2, Pencil, CalendarCheck, Phone, Briefcase } from 'lucide-react';
import { toast } from 'sonner';

interface ProfileData {
  id: string;
  name: string;
  email: string;
  role: string;
  position: string | null;
  avatar_url: string | null;
  calendly_link: string | null;
  phone: string | null;
  agencies: { id: string; name: string }[];
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit states
  const [editingProfile, setEditingProfile] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [positionValue, setPositionValue] = useState('');
  const [phoneValue, setPhoneValue] = useState('');
  const [calendlyValue, setCalendlyValue] = useState('');
  const [avatarUrls, setAvatarUrls] = useState<string[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetch('/api/employee/profile')
      .then((r) => r.json())
      .then((data: ProfileData) => {
        setProfile(data);
        setNameValue(data.name);
        setPositionValue(data.position || '');
        setPhoneValue(data.phone || '');
        setCalendlyValue(data.calendly_link || '');
        setAvatarUrls(data.avatar_url ? [data.avatar_url] : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function saveProfile() {
    if (!nameValue.trim()) {
      toast.error('Name ist erforderlich.');
      return;
    }
    setProfileSaving(true);
    const avatarUrl = avatarUrls[0] ?? null;
    const res = await fetch('/api/employee/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameValue.trim(),
        position: positionValue.trim() || null,
        phone: phoneValue.trim() || null,
        calendly_link: calendlyValue.trim() || null,
        avatar_url: avatarUrl,
      }),
    });
    setProfileSaving(false);
    if (res.ok) {
      setProfile((prev) => prev ? {
        ...prev,
        name: nameValue.trim(),
        position: positionValue.trim() || null,
        phone: phoneValue.trim() || null,
        calendly_link: calendlyValue.trim() || null,
        avatar_url: avatarUrl,
      } : prev);
      setEditingProfile(false);
      toast.success('Profil gespeichert');
    } else {
      toast.error('Fehler beim Speichern');
    }
  }

  function cancelEdit() {
    if (!profile) return;
    setNameValue(profile.name);
    setPositionValue(profile.position || '');
    setPhoneValue(profile.phone || '');
    setCalendlyValue(profile.calendly_link || '');
    setAvatarUrls(profile.avatar_url ? [profile.avatar_url] : []);
    setEditingProfile(false);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return <p className="text-gray-400">Profil konnte nicht geladen werden.</p>;
  }

  return (
    <div className="max-w-2xl">
      <PageHeader label="PROFIL" title="Mein Profil" />

      {/* Profile info */}
      <Card padding="md" className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
              <User className="w-5 h-5 text-gray-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Profil</h2>
          </div>
          {!editingProfile && (
            <button
              onClick={() => setEditingProfile(true)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {editingProfile ? (
          <div className="space-y-4 pl-12">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Avatar</label>
              <FileUpload
                bucket="onboarding-assets"
                path="avatars"
                accept="image/png,image/jpeg,image/webp"
                maxSizeMB={5}
                maxFiles={1}
                value={avatarUrls}
                onChange={setAvatarUrls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
              <Input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                placeholder="Dein Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Position</label>
              <Input
                type="text"
                value={positionValue}
                onChange={(e) => setPositionValue(e.target.value)}
                placeholder="z.B. Account Manager"
                icon={<Briefcase className="w-4 h-4" />}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefon</label>
              <Input
                type="tel"
                value={phoneValue}
                onChange={(e) => setPhoneValue(e.target.value)}
                placeholder="+49 ..."
                icon={<Phone className="w-4 h-4" />}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Calendly-Link</label>
              <Input
                type="url"
                value={calendlyValue}
                onChange={(e) => setCalendlyValue(e.target.value)}
                placeholder="https://calendly.com/dein-name/..."
                icon={<CalendarCheck className="w-4 h-4" />}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={saveProfile} disabled={profileSaving}>
                {profileSaving ? 'Speichert...' : 'Speichern'}
              </Button>
              <Button size="sm" variant="secondary" onClick={cancelEdit}>
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pl-12">
            {profile.avatar_url && (
              <div>
                <img
                  src={profile.avatar_url}
                  alt={profile.name}
                  className="w-16 h-16 rounded-full object-cover border border-gray-200"
                />
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 w-24">Name</span>
              <span className="text-sm font-medium text-gray-900">{profile.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 w-24">E-Mail</span>
              <span className="text-sm font-medium text-gray-900">{profile.email}</span>
            </div>
            {profile.position && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-24">Position</span>
                <span className="text-sm font-medium text-gray-900">{profile.position}</span>
              </div>
            )}
            {profile.phone && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-24">Telefon</span>
                <span className="text-sm font-medium text-gray-900">{profile.phone}</span>
              </div>
            )}
            {profile.calendly_link && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-24">Calendly</span>
                <a
                  href={profile.calendly_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-red-600 hover:underline truncate"
                >
                  {profile.calendly_link}
                </a>
              </div>
            )}
          </div>
        )}
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

      {/* Meine Kunden */}
      {profile.agencies.length > 0 && (
        <Card padding="md">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-gray-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Meine Kunden</h2>
          </div>
          <div className="flex flex-wrap gap-2 pl-12">
            {profile.agencies.map((a) => (
              <Badge key={a.id} tone="softAccent">
                <Building2 className="w-3 h-3 mr-1" />
                {a.name}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
