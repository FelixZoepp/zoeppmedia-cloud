'use client';

import { useState, useEffect } from 'react';
import { Users, Plus, Building2, Pencil, Trash2, Mail, Clock, Send, Link } from 'lucide-react';
import { PageHeader, Card, Button, Badge, Modal, Input } from '@/components/ui';
import type { TeamMember, Agency, EmployeeInvite } from '@/lib/types/database';
import { toast } from 'sonner';

interface TeamMemberWithAssignments extends TeamMember {
  agencies: { id: string; name: string }[];
  email?: string;
  last_login?: string | null;
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMemberWithAssignments[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [invites, setInvites] = useState<EmployeeInvite[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberWithAssignments | null>(null);
  const [form, setForm] = useState({ name: '', position: '', agency_ids: [] as string[] });
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', position: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/team').then((r) => r.json()),
      fetch('/api/admin/agencies').then((r) => r.json()),
      fetch('/api/admin/employee-invite').then((r) => r.ok ? r.json() : []),
    ]).then(([teamData, agencyData, inviteData]) => {
      setMembers(Array.isArray(teamData) ? teamData : []);
      setAgencies(Array.isArray(agencyData) ? agencyData : []);
      setInvites(Array.isArray(inviteData) ? inviteData : []);
      setLoading(false);
    });
  }, []);

  function openAdd() {
    setEditingMember(null);
    setForm({ name: '', position: '', agency_ids: [] });
    setError(null);
    setShowModal(true);
  }

  function openEdit(member: TeamMemberWithAssignments) {
    setEditingMember(member);
    setForm({
      name: member.name,
      position: member.position || '',
      agency_ids: member.agencies?.map((a) => a.id) || [],
    });
    setError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingMember(null);
    setError(null);
  }

  function openInviteModal() {
    setInviteForm({ name: '', email: '', position: '' });
    setInviteError(null);
    setLastInviteUrl(null);
    setShowInviteModal(true);
  }

  function closeInviteModal() {
    setShowInviteModal(false);
    setInviteError(null);
    setLastInviteUrl(null);
  }

  function toggleAgency(agencyId: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      agency_ids: checked
        ? [...f.agency_ids, agencyId]
        : f.agency_ids.filter((id) => id !== agencyId),
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Name ist erforderlich.');
      return;
    }
    setSaving(true);
    setError(null);

    const method = editingMember ? 'PATCH' : 'POST';
    const url = editingMember ? `/api/team/${editingMember.id}` : '/api/team';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Fehler beim Speichern.');
      setSaving(false);
      return;
    }

    const updated: TeamMemberWithAssignments = await res.json();
    if (editingMember) {
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } else {
      setMembers((prev) => [...prev, updated]);
    }

    setSaving(false);
    closeModal();
  }

  async function handleDelete(id: string) {
    if (!confirm('Mitarbeiter wirklich entfernen?')) return;
    const res = await fetch(`/api/team/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
    }
  }

  async function handleInvite() {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) {
      setInviteError('Name und E-Mail sind erforderlich.');
      return;
    }
    setInviting(true);
    setInviteError(null);

    const res = await fetch('/api/admin/employee-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inviteForm),
    });

    const data = await res.json();

    if (!res.ok) {
      setInviteError(data.error || 'Fehler beim Einladen.');
      setInviting(false);
      return;
    }

    setLastInviteUrl(data.invite_url);
    setInviting(false);
    toast.success('Einladung gesendet');

    // Refresh invites list
    fetch('/api/admin/employee-invite')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setInvites(Array.isArray(d) ? d : []));
  }

  function copyInviteUrl() {
    if (lastInviteUrl) {
      navigator.clipboard.writeText(lastInviteUrl);
      toast.success('Link kopiert');
    }
  }

  // Pending invites = not redeemed and not expired
  const pendingInvites = invites.filter(
    (inv) => !inv.redeemed && new Date(inv.expires_at) > new Date()
  );

  return (
    <>
      <PageHeader
        label="COCKPIT"
        title="Team"
        description="Mitarbeiter & Kundenzuweisungen verwalten"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={openInviteModal}>
              <Send className="w-4 h-4" />
              Mitarbeiter einladen
            </Button>
            <Button variant="primary" onClick={openAdd}>
              <Plus className="w-4 h-4" />
              Manuell hinzufügen
            </Button>
          </div>
        }
      />

      <div className="grid gap-4">
        {loading && (
          <Card>
            <p className="text-center text-gray-400 py-8">Wird geladen…</p>
          </Card>
        )}

        {!loading && members.length === 0 && pendingInvites.length === 0 && (
          <Card inset>
            <p className="text-center text-gray-400 py-8">Noch keine Mitarbeiter hinzugefügt</p>
          </Card>
        )}

        {/* Pending invites */}
        {pendingInvites.map((invite) => (
          <Card key={invite.id}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{invite.name}</p>
                  <p className="text-sm text-gray-500">{invite.email}</p>
                  {invite.position && (
                    <p className="text-xs text-gray-400">{invite.position}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Badge tone="neutral">
                  <Clock className="w-3 h-3 mr-1" />
                  Einladung ausstehend
                </Badge>
                <span className="text-xs text-gray-400">
                  Ablauf: {new Date(invite.expires_at).toLocaleDateString('de-DE')}
                </span>
              </div>
            </div>
          </Card>
        ))}

        {/* Registered members */}
        {members.map((member) => (
          <Card key={member.id}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{member.name}</p>
                  <p className="text-sm text-gray-600">{member.position || 'Keine Position'}</p>
                  {member.email && (
                    <p className="text-xs text-gray-400">{member.email}</p>
                  )}
                  {member.last_login && (
                    <p className="text-xs text-gray-400">
                      Zuletzt aktiv: {new Date(member.last_login).toLocaleDateString('de-DE')}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {member.agencies?.map((a) => (
                  <Badge key={a.id} tone="softAccent">
                    <Building2 className="w-3 h-3 mr-1" />
                    {a.name}
                  </Badge>
                ))}
                <Button variant="ghost" size="sm" onClick={() => openEdit(member)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(member.id)}>
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Edit/Add member modal */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={editingMember ? 'Mitarbeiter bearbeiten' : 'Mitarbeiter hinzufügen'}
      >
        <div className="space-y-4">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name"
          />
          <Input
            value={form.position}
            onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
            placeholder="Position (z.B. Account Manager)"
          />

          {agencies.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Zugewiesene Kunden
              </label>
              <div className="space-y-4 max-h-48 overflow-y-auto border border-gray-200 rounded-xl p-5">
                {agencies.map((a) => (
                  <label key={a.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.agency_ids.includes(a.id)}
                      onChange={(e) => toggleAgency(a.id, e.target.checked)}
                      className="accent-red-600 w-4 h-4"
                    />
                    <span className="text-gray-900">{a.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <Button variant="primary" className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Speichern…' : editingMember ? 'Änderungen speichern' : 'Hinzufügen'}
          </Button>
        </div>
      </Modal>

      {/* Invite employee modal */}
      <Modal
        open={showInviteModal}
        onClose={closeInviteModal}
        title="Mitarbeiter einladen"
      >
        <div className="space-y-4">
          {lastInviteUrl ? (
            <>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
                Einladung wurde per E-Mail gesendet.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Einladungslink</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 break-all font-mono text-gray-700">
                    {lastInviteUrl}
                  </code>
                  <Button variant="secondary" size="sm" onClick={copyInviteUrl}>
                    <Link className="w-4 h-4" />
                    Kopieren
                  </Button>
                </div>
              </div>
              <Button variant="primary" className="w-full" onClick={closeInviteModal}>
                Fertig
              </Button>
            </>
          ) : (
            <>
              <Input
                value={inviteForm.name}
                onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Name des Mitarbeiters"
              />
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="E-Mail-Adresse"
              />
              <Input
                value={inviteForm.position}
                onChange={(e) => setInviteForm((f) => ({ ...f, position: e.target.value }))}
                placeholder="Position (optional)"
              />

              {inviteError && (
                <p className="text-sm text-red-600">{inviteError}</p>
              )}

              <Button variant="primary" className="w-full" onClick={handleInvite} disabled={inviting}>
                {inviting ? 'Einladung wird gesendet…' : 'Einladung senden'}
              </Button>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
