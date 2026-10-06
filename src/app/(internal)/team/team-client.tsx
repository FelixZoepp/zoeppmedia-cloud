'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Mail, Clock, Send, Link, AlertTriangle, ChevronDown } from 'lucide-react';
import { PageHeader, Card, Button, Badge, Modal, Input, Avatar, CountUp, SegmentedControl } from '@/components/ui';
import type { MemberWorkload } from '@/lib/team/workload';
import type { TeamMember, Agency, EmployeeInvite } from '@/lib/types/database';
import { toast } from 'sonner';
import { ABTEILUNGEN, BEREICHE, BEREICH_LABEL, abteilungVon } from '@/lib/team/funktionen';

interface TeamMemberWithAssignments extends TeamMember {
  agencies: { id: string; name: string }[];
  email?: string;
  last_login?: string | null;
}

const OHNE = 'ohne';

/** Online-Status grob aus dem letzten Login: heute = grün, diese Woche = gelb, sonst grau */
function presence(lastLogin: string | null): { color: string; label: string } {
  if (!lastLogin) return { color: '#a69f9b', label: 'noch nie eingeloggt' };
  const h = (Date.now() - new Date(lastLogin).getTime()) / 36e5;
  if (h < 24) return { color: '#2fb36b', label: 'heute aktiv' };
  if (h < 24 * 7) return { color: '#e8a317', label: 'diese Woche aktiv' };
  return { color: '#a69f9b', label: 'länger nicht aktiv' };
}

function workloadColor(w: number) {
  if (w >= 85) return 'bg-amber-600';
  return 'bg-red-700';
}

export function TeamClient({ isAdmin }: { isAdmin: boolean }) {
  const [workload, setWorkload] = useState<MemberWorkload[]>([]);
  const [filter, setFilter] = useState('alle');
  const [members, setMembers] = useState<TeamMemberWithAssignments[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [invites, setInvites] = useState<EmployeeInvite[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberWithAssignments | null>(null);
  const [form, setForm] = useState({ name: '', position: '', agency_ids: [] as string[] });
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', position: '', funktion: '' });
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
      fetch('/api/team/workload').then((r) => (r.ok ? r.json() : [])),
    ]).then(([teamData, agencyData, inviteData, workloadData]) => {
      setWorkload(Array.isArray(workloadData) ? workloadData : []);
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
    setInviteForm({ name: '', email: '', position: '', funktion: '' });
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

  async function changeBereich(userId: string, funktion: string) {
    const vorher = workload;
    setWorkload((prev) => prev.map((w) => (w.user_id === userId ? { ...w, funktion: funktion || null } : w)));
    const res = await fetch('/api/admin/team-bereich', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, funktion: funktion || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setWorkload(vorher);
      toast.error(data.error ?? 'Bereich konnte nicht geändert werden');
      return;
    }
    toast.success(
      data.uebernommen ? `Bereich geändert – ${data.uebernommen} offene Schritte übernommen` : 'Bereich geändert',
    );
    if (data.uebernommen) fetch('/api/team/workload').then((r) => (r.ok ? r.json() : null)).then((d) => Array.isArray(d) && setWorkload(d));
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

  // Karten = echte Logins; Kundenzuweisungen aus team_members (passender user_id + Name)
  const norm = (x: string) => x.trim().toLowerCase();
  const memberFor = (w: MemberWorkload) =>
    members.find((m) => m.user_id === w.user_id && norm(m.name) === norm(w.name)) ??
    // gleicher Vorname reicht, wenn es nur einen Eintrag für diesen Login gibt
    members.find(
      (m) =>
        m.user_id === w.user_id &&
        members.filter((x) => x.user_id === w.user_id).length === 1 &&
        norm(m.name).split(/\s+/)[0] === norm(w.name).split(/\s+/)[0],
    );
  const matchedIds = new Set(workload.map((w) => memberFor(w)?.id).filter(Boolean));
  const ohneLogin = members.filter((m) => !matchedIds.has(m.id));
  const bereichVon = (w: MemberWorkload): string => abteilungVon(w.funktion) ?? OHNE;
  // Alle Abteilungen zeigen, auch leere – so sieht man, wo noch niemand ist (z. B. Sales vor der Einstellung)
  const gruppen = [...ABTEILUNGEN.map((b) => ({ value: b.value as string, label: b.label as string, beschreibung: b.beschreibung as string })), { value: OHNE, label: 'Ohne Bereich', beschreibung: 'Noch keinem Bereich zugeordnet' }]
    .map((g) => {
      const leute = workload.filter((w) => bereichVon(w) === g.value);
      return {
        ...g,
        leute,
        // Unterbereiche mit Besetzung, z. B. Sales: Vertriebsleitung 0 · Setting 1 · Closing 0
        bereiche: BEREICHE.filter((b) => b.abteilung === g.value).map((b) => ({
          label: b.label as string,
          anzahl: leute.filter((w) => w.funktion === b.value).length,
        })),
        offen: leute.reduce((n, w) => n + w.offen, 0),
        ueberfaellig: leute.reduce((n, w) => n + w.ueberfaellig, 0),
        erledigt: leute.reduce((n, w) => n + w.erledigt_30d, 0),
        auslastung: leute.length ? Math.round(leute.reduce((n, w) => n + w.workload, 0) / leute.length) : null,
      };
    })
    .filter((g) => (g.value === OHNE ? g.leute.length > 0 : true))
    .filter((g) => filter === 'alle' || g.value === filter);
  const heuteAktiv = workload.filter((w) => presence(w.last_login).label === 'heute aktiv').length;

  return (
    <>
      <PageHeader
        title="Team"
        description="Wer im Team was trägt – und wer gerade Luft hat."
        action={
          isAdmin && <>
            <Button variant="secondary" size="lg" onClick={openAdd}>
              <Plus />
              Manuell hinzufügen
            </Button>
            <Button variant="primary" size="lg" onClick={openInviteModal}>
              <Send />
              Mitarbeiter einladen
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          items={[
            { value: 'alle', label: 'Alle Abteilungen' },
            ...ABTEILUNGEN.map((b) => ({ value: b.value as string, label: b.label as string })),
            ...(workload.some((w) => bereichVon(w) === OHNE) ? [{ value: OHNE, label: 'Ohne Bereich' }] : []),
          ]}
          value={filter}
          onChange={setFilter}
        />
        <span className="text-[14px] text-gray-600">
          <strong className="font-semibold text-ink">{heuteAktiv}</strong> heute aktiv
        </span>
      </div>

      {loading && (
        <Card>
          <p className="py-8 text-center text-gray-500">Wird geladen…</p>
        </Card>
      )}

      {!loading && workload.length === 0 && members.length === 0 && pendingInvites.length === 0 && (
        <Card inset>
          <p className="py-8 text-center text-gray-500">Noch keine Mitarbeiter hinzugefügt</p>
        </Card>
      )}

      {!loading && workload.length > 0 && filter === 'alle' && (
        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {gruppen
            .filter((g) => g.value !== OHNE)
            .map((g) => (
              <button
                key={g.value}
                onClick={() => setFilter(g.value)}
                className="fx-lift rounded-[20px] bg-card p-4 text-left shadow-[0_1px_0_rgba(0,0,0,.02)] transition-colors hover:bg-red-50/60"
              >
                <p className="text-[13px] font-medium text-gray-600">{g.label}</p>
                <p className="mt-1 text-[24px] font-semibold leading-none tracking-[-0.03em]">
                  {g.leute.length}
                  <span className="ml-1 text-[13px] font-normal text-gray-500">{g.leute.length === 1 ? 'Person' : 'Personen'}</span>
                </p>
                <p className="mt-2 text-[12.5px] text-gray-600">
                  {g.leute.length === 0 ? (
                    <span className="font-medium text-amber-700">Noch unbesetzt</span>
                  ) : (
                    <>
                      {g.offen} offen{g.ueberfaellig > 0 && <span className="font-medium text-red-700"> · {g.ueberfaellig} überfällig</span>}
                    </>
                  )}
                </p>
                {g.auslastung !== null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full ${workloadColor(g.auslastung)}`} style={{ width: `${Math.max(g.auslastung, 2)}%` }} />
                  </div>
                )}
              </button>
            ))}
        </div>
      )}

      {!loading && workload.length > 0 && gruppen.map((g) => (
        <section key={g.value} className="mb-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
            <div>
              <h2 className="text-[20px] font-medium tracking-[-0.02em]">{g.label}</h2>
              <p className="text-[13.5px] text-gray-600">{g.beschreibung}</p>
              {g.bereiche.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.bereiche.map((b) => (
                    <span
                      key={b.label}
                      className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${b.anzahl ? 'bg-red-50 text-red-800' : 'bg-gray-100 text-gray-500'}`}
                    >
                      {b.label} · {b.anzahl || 'unbesetzt'}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {g.leute.length > 0 && (
              <p className="text-[13.5px] text-gray-600">
                {g.leute.length} {g.leute.length === 1 ? 'Person' : 'Personen'} · {g.offen} offen · {g.erledigt} erledigt (30 T.) · Ø Auslastung{' '}
                <strong className={g.auslastung !== null && g.auslastung >= 85 ? 'text-amber-700' : 'text-ink'}>{g.auslastung}%</strong>
              </p>
            )}
          </div>
          {g.leute.length === 0 ? (
            <Card inset>
              <p className="py-3 text-center text-[14px] text-gray-500">
                Noch niemand in dieser Abteilung.{isAdmin && ' Lade jemanden ein oder ordne eine Person über den Bereich auf ihrer Karte zu.'}
              </p>
            </Card>
          ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {g.leute.map((w) => {
          const tm = memberFor(w);
          const p = presence(w.last_login);
          return (
            <Card key={w.user_id} className="fx-lift flex flex-col items-center text-center">
              <div className="relative mt-2">
                <Avatar name={w.name} src={w.avatar_url} size={72} />
                <span
                  className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full shadow-[0_0_0_3px_var(--card)]"
                  style={{ background: p.color }}
                  title={p.label}
                />
              </div>
              <h2 className="mt-3.5 text-[20px] font-medium tracking-[-0.02em]">{w.name}</h2>
              <p className="text-[14px] text-gray-600">{w.position || (w.role === 'admin' ? 'Admin' : 'Mitarbeiter')}</p>
              {isAdmin ? (
                <label className="relative mt-2.5 inline-flex items-center">
                  <span className="sr-only">Bereich</span>
                  <select
                    value={w.funktion && BEREICH_LABEL[w.funktion] ? w.funktion : ''}
                    onChange={(e) => changeBereich(w.user_id, e.target.value)}
                    className="cursor-pointer appearance-none rounded-full bg-red-50 py-1 pl-3 pr-7 text-[13px] font-medium text-red-800 outline-none hover:bg-red-100"
                  >
                    <option value="">Bereich wählen …</option>
                    {ABTEILUNGEN.map((a) => (
                      <optgroup key={a.value} label={a.label}>
                        {BEREICHE.filter((b) => b.abteilung === a.value).map((b) => (
                          <option key={b.value} value={b.value}>{b.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-red-800" />
                </label>
              ) : (
                w.funktion && (
                  <span className="mt-2.5 rounded-full bg-red-50 px-3 py-1 text-[13px] font-medium text-red-800">
                    {BEREICH_LABEL[w.funktion] ?? w.funktion}
                  </span>
                )
              )}

              <div className="mt-5 grid w-full grid-cols-2 border-t border-hair pt-4">
                <div>
                  <p className="text-[24px] font-semibold tracking-[-0.03em]"><CountUp value={w.offen} /></p>
                  <p className="text-[13px] text-gray-600">Offene Aufgaben</p>
                </div>
                <div>
                  <p className="text-[24px] font-semibold tracking-[-0.03em]"><CountUp value={w.erledigt_30d} /></p>
                  <p className="text-[13px] text-gray-600">Erledigt (30 T.)</p>
                </div>
              </div>

              <div className="mt-4 w-full text-left">
                <div className="flex items-center justify-between text-[13.5px] text-gray-600">
                  <span>Auslastung</span>
                  <span className={w.workload >= 85 ? 'font-semibold text-amber-700' : ''}>{w.workload}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full origin-left rounded-full ${workloadColor(w.workload)}`}
                    style={{ width: `${Math.max(w.workload, 2)}%`, animation: 'fx-bar 1.1s cubic-bezier(.33,1,.68,1) .2s both' }}
                  />
                </div>
                <p className="mt-2 min-h-[18px] text-xs text-gray-500">
                  {w.ueberfaellig > 0 ? (
                    <span className="inline-flex items-center gap-1 font-medium text-red-700">
                      <AlertTriangle className="h-3 w-3" /> {w.ueberfaellig} überfällig
                    </span>
                  ) : (
                    [
                      w.quellen.schritte && `${w.quellen.schritte} Schritte`,
                      w.quellen.ads && `${w.quellen.ads} Ads`,
                      w.quellen.projekt && `${w.quellen.projekt} Projekt`,
                      w.quellen.intern && `${w.quellen.intern} intern`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'nichts offen'
                  )}
                </p>
              </div>

              {tm && tm.agencies?.length > 0 && (
                <p className="mt-1 w-full truncate text-left text-xs text-gray-500" title={tm.agencies.map((a) => a.name).join(', ')}>
                  Betreut: {tm.agencies.map((a) => a.name).join(', ')}
                </p>
              )}

              <div className={`mt-4 grid w-full gap-2.5 ${tm ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <a
                  href={`mailto:${w.email}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-card text-[15px] font-medium text-ink shadow-[inset_0_0_0_1.5px_var(--r-950)] transition-colors hover:bg-red-50"
                >
                  <Mail className="h-4 w-4" /> E-Mail
                </a>
                {tm && (
                  <Button onClick={() => openEdit(tm)}>
                    <Pencil /> Bearbeiten
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
          )}
        </section>
      ))}

      {(pendingInvites.length > 0 || ohneLogin.length > 0) && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {pendingInvites.length > 0 && (
            <Card>
              <h2 className="text-[19px] font-medium tracking-[-0.02em]">Ausstehende Einladungen</h2>
              <ul className="mt-4 space-y-3">
                {pendingInvites.map((invite) => (
                  <li key={invite.id} className="flex items-center gap-3.5">
                    <Avatar name={invite.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">{invite.name}</p>
                      <p className="truncate text-[13px] text-gray-600">{invite.email}</p>
                    </div>
                    <Badge tone="warning">
                      <Clock className="h-3 w-3" /> bis {new Date(invite.expires_at).toLocaleDateString('de-DE')}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {ohneLogin.length > 0 && (
            <Card>
              <h2 className="text-[19px] font-medium tracking-[-0.02em]">Ohne eigenen Login</h2>
              <p className="mt-1 text-[13.5px] text-gray-600">Manuell angelegt – ohne Auslastung, weil keine Aufgaben zugewiesen werden können.</p>
              <ul className="mt-4 space-y-3">
                {ohneLogin.map((member) => (
                  <li key={member.id} className="flex items-center gap-3.5">
                    <Avatar name={member.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">{member.name}</p>
                      <p className="truncate text-[13px] text-gray-600">
                        {member.position || 'Keine Position'}
                        {member.agencies?.length ? ` · ${member.agencies.length} Kunden` : ''}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(member)} aria-label="Bearbeiten">
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(member.id)} aria-label="Entfernen">
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

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
              <select
                value={inviteForm.funktion}
                onChange={(e) => setInviteForm((f) => ({ ...f, funktion: e.target.value }))}
                className="h-11 w-full rounded-[12px] bg-card px-3.5 text-[15px] text-ink shadow-[inset_0_0_0_1.5px_var(--hair)]"
              >
                <option value="">Bereich … (optional)</option>
                {ABTEILUNGEN.map((a) => (
                  <optgroup key={a.value} label={a.label}>
                    {BEREICHE.filter((b) => b.abteilung === a.value).map((b) => (
                      <option key={b.value} value={b.value}>{b.label} – {b.beschreibung}</option>
                    ))}
                  </optgroup>
                ))}
              </select>

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
