'use client';

import { useCallback, useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Badge, Card } from '@/components/ui';

interface Daten {
  ready: boolean;
  lektionen: number;
  anfrage_am?: string | null;
  users: Array<{ id: string; name: string; email: string; role: string; freigeschaltet_seit: string | null; erledigt: number }>;
}

/** Kundenakte: Masterclass für Führungskräfte je Login freischalten + Fortschritt */
export function MasterclassFuehrungCard({ agencyId }: { agencyId: string }) {
  const [d, setD] = useState<Daten | null>(null);
  const [arbeitet, setArbeitet] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const res = await fetch(`/api/admin/agencies/${agencyId}/masterclass-fuehrung`, { cache: 'no-store' });
    if (res.ok) setD(await res.json());
  }, [agencyId]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  async function schalten(userId: string, an: boolean) {
    setArbeitet(userId);
    const res = await fetch(`/api/admin/agencies/${agencyId}/masterclass-fuehrung`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, an }),
    });
    const data = await res.json().catch(() => ({}));
    setArbeitet(null);
    if (!res.ok) return void toast.error(data.error ?? 'Fehlgeschlagen');
    toast.success(an ? 'Freigeschaltet' : 'Zugriff entfernt');
    void laden();
  }

  return (
    <Card className="mb-6">
      <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
        <GraduationCap className="h-5 w-5 text-red-800" /> Masterclass für Führungskräfte
      </h2>
      <p className="mt-1 text-[13.5px] text-gray-600">
        Je Login freischalten. Neue Führungskräfte zuerst oben unter „Kunden-Logins“ als Mitarbeiter einladen.
      </p>
      {d?.anfrage_am && (
        <p className="mt-2 text-[13.5px] font-medium text-amber-700">Vom Kunden angefragt am {new Date(d.anfrage_am).toLocaleDateString('de-DE')}</p>
      )}
      {d && !d.ready && <p className="mt-3 text-[14px] text-amber-700">Die Datenbank-Änderung dafür ist noch nicht eingespielt.</p>}
      {d?.ready && (
        <ul className="mt-3 space-y-2">
          {d.users.length === 0 && <li className="text-[14px] text-gray-600">Noch keine Logins bei diesem Kunden.</li>}
          {d.users.map((u) => {
            const an = !!u.freigeschaltet_seit;
            return (
              <li key={u.id} className="flex items-center gap-3">
                <Avatar name={u.name} size={32} />
                <span className="min-w-0 flex-1 truncate text-[14px]">
                  {u.name} <span className="text-gray-500">· {u.email}</span>
                </span>
                {an && <Badge tone="success">{d.lektionen ? `${u.erledigt}/${d.lektionen} Lektionen` : 'Freigeschaltet'}</Badge>}
                <button
                  disabled={arbeitet === u.id}
                  onClick={() => void schalten(u.id, !an)}
                  className={`h-9 rounded-full px-4 text-[13.5px] font-medium disabled:opacity-50 ${an ? 'text-gray-600 hover:text-red-700' : 'bg-red-800 text-red-50 hover:bg-red-700'}`}
                >
                  {an ? 'Zugriff entfernen' : 'Freischalten'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
