'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, Input } from '@/components/ui';

type Rolle = 'agency_owner' | 'agency_member' | 'agency_viewer';
const LABEL: Record<Rolle, string> = { agency_owner: 'Inhaber', agency_member: 'Mitarbeiter', agency_viewer: 'Nur lesen' };

interface Daten {
  users: Array<{ id: string; name: string; email: string; role: string; last_login: string | null }>;
  einladungen: Array<{ id: string; email: string; name: string | null; role: Rolle; expires_at: string }>;
}

/** Kunden-Logins auf der internen Kundenseite: wer kann sich in die Kunden-Cloud einloggen + einladen */
export function KundenZugaengeCard({ agencyId }: { agencyId: string }) {
  const [d, setD] = useState<Daten | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Rolle>('agency_owner');
  const [sendet, setSendet] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const res = await fetch(`/api/admin/agencies/${agencyId}/zugaenge`, { cache: 'no-store' });
    if (res.ok) setD(await res.json());
  }, [agencyId]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function einladen() {
    setSendet(true);
    const res = await fetch(`/api/admin/agencies/${agencyId}/zugaenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, role }),
    });
    const data = await res.json().catch(() => ({}));
    setSendet(false);
    if (!res.ok) return void toast.error(data.error ?? 'Einladung fehlgeschlagen');
    setLink(data.link);
    setEmail('');
    setName('');
    toast.success(data.versendet ? 'Einladung per E-Mail verschickt' : 'Einladung erstellt – E-Mail ging nicht raus');
    void laden();
  }

  return (
    <Card className="mb-6">
      <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
        <KeyRound className="h-5 w-5 text-red-800" /> Kunden-Logins
      </h2>
      <p className="mt-1 text-[13.5px] text-gray-600">Wer sich in die Recruiting Cloud dieses Kunden einloggen kann.</p>

      {d && (
        <ul className="mt-3 space-y-2">
          {d.users.length === 0 && d.einladungen.length === 0 && <li className="text-[14px] text-amber-700">Noch kein Login – der Kunde kann sich bisher nicht einloggen.</li>}
          {d.users.map((u) => (
            <li key={u.id} className="flex items-center gap-3">
              <Avatar name={u.name} size={32} />
              <span className="min-w-0 flex-1 truncate text-[14px]">
                {u.name} <span className="text-gray-500">· {u.email}</span>
              </span>
              <Badge>{LABEL[u.role as Rolle] ?? u.role}</Badge>
              <span className="hidden text-[12px] text-gray-500 sm:inline">{u.last_login ? `zuletzt ${new Date(u.last_login).toLocaleDateString('de-DE')}` : 'noch nie eingeloggt'}</span>
            </li>
          ))}
          {d.einladungen.map((e) => (
            <li key={e.id} className="flex items-center gap-3 text-[14px] text-gray-600">
              <span className="min-w-0 flex-1 truncate">✉︎ {e.name ? `${e.name} · ` : ''}{e.email}</span>
              <Badge tone="warning">{LABEL[e.role]} · eingeladen</Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <Input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <Input type="email" placeholder="E-Mail des Kunden" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value as Rolle)} className="h-11 rounded-[12px] bg-card px-3 text-[14px] shadow-[inset_0_0_0_1.5px_var(--hair)]" aria-label="Rolle">
          {(Object.keys(LABEL) as Rolle[]).map((r) => (
            <option key={r} value={r}>{LABEL[r]}</option>
          ))}
        </select>
        <Button variant="primary" onClick={einladen} disabled={sendet || !email.trim()}>
          <Send /> Einladen
        </Button>
      </div>
      {link && (
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 break-all rounded-[12px] bg-panel px-3 py-2 text-xs text-gray-700">{link}</code>
          <Button variant="secondary" size="sm" onClick={() => { void navigator.clipboard.writeText(link); toast.success('Link kopiert'); }}>
            <Copy /> Kopieren
          </Button>
        </div>
      )}
    </Card>
  );
}
