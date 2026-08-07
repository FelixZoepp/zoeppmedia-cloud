'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import type { Agency } from '@/lib/types/database';

type AgencyWithMeta = Agency & {
  candidate_count: number;
  last_login: string | null;
};

export default function AdminPage() {
  const [agencies, setAgencies] = useState<AgencyWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/agencies')
      .then((res) => res.json())
      .then((data) => {
        setAgencies(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        label="COCKPIT"
        title="Agenturen"
        counter={`${agencies.length} gesamt`}
        action={
          <Link href="/invites">
            <Badge tone="accent">+ Neue Agentur einladen</Badge>
          </Link>
        }
      />

      {agencies.length === 0 ? (
        <Card padding="lg" className="text-center">
          <p className="text-[var(--text-secondary)] text-[var(--text-body)]">
            Noch keine Agenturen. Lade eine ein!
          </p>
        </Card>
      ) : (
        <Card padding="sm" className="overflow-hidden !p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-left px-6 py-4 text-[var(--text-sm)] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                  Agentur
                </th>
                <th className="text-left px-6 py-4 text-[var(--text-sm)] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                  Ansprechpartner
                </th>
                <th className="text-left px-6 py-4 text-[var(--text-sm)] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                  Bewerber
                </th>
                <th className="text-left px-6 py-4 text-[var(--text-sm)] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                  Letzter Login
                </th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a, index) => (
                <tr
                  key={a.id}
                  className={`hover:bg-red-50/40 transition-colors ${
                    index < agencies.length - 1 ? 'border-b border-[var(--border-default)]' : ''
                  }`}
                >
                  <td className="px-6 py-5">
                    <Link
                      href={`/clients/${a.id}`}
                      className="text-red-500 hover:text-red-600 font-semibold transition-colors"
                    >
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-6 py-5 text-[var(--text-secondary)]">
                    {a.contact_name}
                  </td>
                  <td className="px-6 py-5">
                    <Badge tone={a.candidate_count > 0 ? 'softAccent' : 'neutral'}>
                      {a.candidate_count}
                    </Badge>
                  </td>
                  <td className="px-6 py-5 text-[var(--text-sm)] text-[var(--text-tertiary)]">
                    {a.last_login
                      ? new Date(a.last_login).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : (
                        <Badge tone="outline">Nie</Badge>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
