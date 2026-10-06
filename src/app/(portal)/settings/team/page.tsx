'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Copy, Mail, RefreshCw, Send, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, Input, Modal, PageHeader } from '@/components/ui';

type Rolle = 'agency_owner' | 'agency_member' | 'agency_viewer';

const ROLLE: Record<Rolle, { label: string; text: string }> = {
  agency_owner: { label: 'Inhaber', text: 'Alles, inkl. Team & Einstellungen' },
  agency_member: { label: 'Mitarbeiter', text: 'Bewerber bearbeiten, anrufen, Chat, Termine' },
  agency_viewer: { label: 'Nur lesen', text: 'Sieht Bewerber und Zahlen, kann nichts ändern' },
};

interface Daten {
  ich: string;
  kannVerwalten: boolean;
  rollen: Rolle[];
  users: Array<{ id: string; name: string; email: string; role: Rolle; last_login: string | null; avatar_url: string | null }>;
  einladungen: Array<{ id: string; email: string; name: string | null; role: Rolle; expires_at: string; email_sent_at: string | null }>;
}

function zuletzt(iso: string | null): string {
  if (!iso) return 'noch nie eingeloggt';
  return `zuletzt ${new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export default function TeamZugaengePage() {
  const [d, setD] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState(false);
  const [form, setForm] = useState<{ name: string; email: string; role: Rolle }>({ name: '', email: '', role: 'agency_member' });
  const [sendet, setSendet] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const res = await fetch('/api/agency-team', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setFehler(data.error ?? 'Team konnte nicht geladen werden');
    else {
      setD(data);
      setFehler(null);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function einladen() {
    setSendet(true);
    const res = await fetch('/api/agency-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setSendet(false);
    if (!res.ok) return void toast.error(data.error ?? 'Einladung fehlgeschlagen');
    setLink(data.link);
    toast.success(data.versendet ? 'Einladung per E-Mail verschickt' : 'Einladung erstellt – E-Mail ging nicht raus, Link bitte selbst schicken');
    void laden();
  }

  async function aktion(url: string, method: string, body?: unknown, ok?: string) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return void toast.error(data.error ?? 'Das hat nicht geklappt');
    if (ok) toast.success(ok);
    void laden();
  }

  const schliessen = () => {
    setOffen(false);
    setLink(null);
    setForm({ name: '', email: '', role: 'agency_member' });
  };

  return (
    <div>
      <Link href="/settings" className="mb-3 inline-flex items-center gap-1.5 text-[14px] text-gray-600 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Einstellungen
      </Link>
      <PageHeader
        title="Team & Zugänge"
        description="Wer sich in eure Recruiting Cloud einloggen kann – z. B. euer eigener Innendienst."
        action={
          d?.kannVerwalten && (
            <Button variant="primary" size="lg" onClick={() => setOffen(true)}>
              <UserPlus /> Kollegen einladen
            </Button>
          )
        }
      />

      {fehler && (
        <Card className="mb-4 text-[14px] text-red-800">{fehler}</Card>
      )}

      {!d ? (
        !fehler && (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
          </div>
        )
      ) : (
        <div className="space-y-4">
          <Card>
            <h2 className="text-[19px] font-medium tracking-[-0.02em]">Zugänge ({d.users.length})</h2>
            <ul className="mt-3 divide-y divide-[var(--hair)]">
              {d.users.map((u) => {
                const bearbeitbar = d.kannVerwalten && u.id !== d.ich && (u.role !== 'agency_owner' || d.rollen.includes('agency_owner'));
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Avatar name={u.name} src={u.avatar_url} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">
                        {u.name} {u.id === d.ich && <span className="text-[13px] font-normal text-gray-500">(du)</span>}
                      </p>
                      <p className="truncate text-[13px] text-gray-600">
                        {u.email} · {zuletzt(u.last_login)}
                      </p>
                    </div>
                    {bearbeitbar ? (
                      <select
                        value={u.role}
                        onChange={(e) => aktion(`/api/agency-team/${u.id}`, 'PATCH', { role: e.target.value }, 'Rolle geändert')}
                        className="h-9 rounded-full bg-panel px-3 text-[13.5px] font-medium outline-none"
                        aria-label={`Rolle von ${u.name}`}
                      >
                        {d.rollen.map((r) => (
                          <option key={r} value={r}>
                            {ROLLE[r].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge>{ROLLE[u.role]?.label ?? u.role}</Badge>
                    )}
                    {bearbeitbar && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Zugang von ${u.name} entfernen`}
                        onClick={() => {
                          if (confirm(`Zugang von ${u.name} wirklich entfernen? Bewerber und Verlauf bleiben erhalten.`)) {
                            void aktion(`/api/agency-team/${u.id}`, 'DELETE', undefined, 'Zugang entfernt');
                          }
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {d.einladungen.length > 0 && (
            <Card>
              <h2 className="text-[19px] font-medium tracking-[-0.02em]">Offene Einladungen</h2>
              <ul className="mt-3 divide-y divide-[var(--hair)]">
                {d.einladungen.map((e) => {
                  const abgelaufen = new Date(e.expires_at) < new Date();
                  return (
                    <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-panel text-gray-500">
                        <Mail className="h-[18px] w-[18px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium">{e.name || e.email}</p>
                        <p className="truncate text-[13px] text-gray-600">
                          {e.name ? `${e.email} · ` : ''}
                          {ROLLE[e.role]?.label ?? e.role}
                        </p>
                      </div>
                      <Badge tone={abgelaufen ? 'danger' : 'warning'}>
                        <Clock className="h-3 w-3" /> {abgelaufen ? 'abgelaufen' : `bis ${new Date(e.expires_at).toLocaleDateString('de-DE')}`}
                      </Badge>
                      {d.kannVerwalten && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => aktion(`/api/agency-team/einladungen/${e.id}`, 'POST', undefined, 'Einladung erneut gesendet')}>
                            <RefreshCw /> Erneut senden
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Einladung zurückziehen"
                            onClick={() => aktion(`/api/agency-team/einladungen/${e.id}`, 'DELETE', undefined, 'Einladung zurückgezogen')}
                          >
                            <X />
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card inset>
            <h2 className="text-[15px] font-medium">Rollen</h2>
            <ul className="mt-2 space-y-1.5 text-[13.5px] text-gray-600">
              {(Object.keys(ROLLE) as Rolle[]).map((r) => (
                <li key={r}>
                  <strong className="font-medium text-ink">{ROLLE[r].label}:</strong> {ROLLE[r].text}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Modal open={offen} onClose={schliessen} title="Kollegen einladen">
        {link ? (
          <div className="space-y-4">
            <p className="text-[14px] text-gray-700">Die Einladung ist raus. Falls die E-Mail nicht ankommt, kannst du diesen Link direkt schicken (7 Tage gültig):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-[12px] bg-panel px-3 py-2 text-xs text-gray-700">{link}</code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  toast.success('Link kopiert');
                }}
              >
                <Copy /> Kopieren
              </Button>
            </div>
            <Button variant="primary" className="w-full" onClick={schliessen}>
              Fertig
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Input placeholder="Name (optional)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Input type="email" placeholder="E-Mail-Adresse" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <div className="space-y-2">
              {(d?.rollen ?? ['agency_member', 'agency_viewer']).map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-start gap-3 rounded-[14px] p-3 shadow-[inset_0_0_0_1.5px_var(--hair)] ${form.role === r ? 'bg-red-50/60 shadow-[inset_0_0_0_1.5px_var(--r-700)]' : ''}`}
                >
                  <input type="radio" name="rolle" className="mt-1 accent-red-700" checked={form.role === r} onChange={() => setForm((f) => ({ ...f, role: r }))} />
                  <span>
                    <span className="block text-[14.5px] font-medium">{ROLLE[r].label}</span>
                    <span className="block text-[13px] text-gray-600">{ROLLE[r].text}</span>
                  </span>
                </label>
              ))}
            </div>
            <Button variant="primary" className="w-full" onClick={einladen} disabled={sendet || !form.email.trim()}>
              <Send /> {sendet ? 'Wird gesendet …' : 'Einladung senden'}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
