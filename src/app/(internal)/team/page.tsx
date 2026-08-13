'use client';

import { useState, useEffect } from 'react';
import { Users, Plus, Building2, Pencil, Trash2 } from 'lucide-react';
import { PageHeader, Card, Button, Badge, Modal, Input } from '@/components/ui';
import type { TeamMember, Agency } from '@/lib/types/database';

interface TeamMemberWithAssignments extends TeamMember {
  agencies: { id: string; name: string }[];
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMemberWithAssignments[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberWithAssignments | null>(null);
  const [form, setForm] = useState({ name: '', position: '', agency_ids: [] as string[] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/team').then((r) => r.json()),
      fetch('/api/admin/agencies').then((r) => r.json()),
    ]).then(([teamData, agencyData]) => {
      setMembers(Array.isArray(teamData) ? teamData : []);
      setAgencies(Array.isArray(agencyData) ? agencyData : []);
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

  return (
    <>
      <PageHeader
        label="COCKPIT"
        title="Team"
        description="Mitarbeiter & Kundenzuweisungen verwalten"
        action={
          <Button variant="primary" onClick={openAdd}>
            <Plus className="w-4 h-4" />
            Mitarbeiter hinzufügen
          </Button>
        }
      />

      <div className="grid gap-5">
        {loading && (
          <Card>
            <p className="text-center text-[var(--text-tertiary)] py-8">Wird geladen…</p>
          </Card>
        )}

        {!loading && members.length === 0 && (
          <Card inset>
            <p className="text-center text-[var(--text-tertiary)] py-8">Noch keine Mitarbeiter hinzugefügt</p>
          </Card>
        )}

        {members.map((member) => (
          <Card key={member.id}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-[#E31B23]" />
                </div>
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">{member.name}</p>
                  <p className="text-sm text-[var(--text-secondary)]">{member.position || 'Keine Position'}</p>
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

      <Modal
        open={showModal}
        onClose={closeModal}
        title={editingMember ? 'Mitarbeiter bearbeiten' : 'Mitarbeiter hinzufügen'}
      >
        <div className="space-y-8">
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
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Zugewiesene Kunden
              </label>
              <div className="space-y-4 max-h-48 overflow-y-auto border border-[var(--border-default)] rounded-[var(--radius-md)] p-5">
                {agencies.map((a) => (
                  <label key={a.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.agency_ids.includes(a.id)}
                      onChange={(e) => toggleAgency(a.id, e.target.checked)}
                      className="accent-[#E31B23] w-4 h-4"
                    />
                    <span className="text-[var(--text-primary)]">{a.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-[#E31B23]">{error}</p>
          )}

          <Button variant="primary" className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Speichern…' : editingMember ? 'Änderungen speichern' : 'Hinzufügen'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
