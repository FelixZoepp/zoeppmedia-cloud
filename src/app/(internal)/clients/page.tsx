'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Building2 } from 'lucide-react';
import type { Agency } from '@/lib/types/database';

type AgencyListItem = Agency & {
  candidate_count: number;
};

export default function ClientsIndexPage() {
  const [agencies, setAgencies] = useState<AgencyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/agencies')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setAgencies(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-[#E31B23] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        label="COCKPIT"
        title="Kunden"
        counter={`${agencies.length} gesamt`}
      />

      {agencies.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Building2 className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-2">Keine Kunden</h2>
          <p className="text-[var(--text-secondary)]">
            Noch keine Agenturen angelegt. Erstelle eine Einladung unter &quot;Einladungen&quot;.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {agencies.map((a) => (
            <Link key={a.id} href={`/clients/${a.id}`}>
              <Card padding="md" className="hover:shadow-[var(--shadow-md)] transition-shadow cursor-pointer group">
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-10 h-10 rounded-[var(--radius-md)] bg-gradient-to-b from-[#E31B23] to-[#C00015] flex items-center justify-center text-white font-bold text-[15px] flex-shrink-0">
                    {a.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate group-hover:text-[#E31B23] transition-colors">
                      {a.name}
                    </p>
                    <p className="text-[13px] text-[var(--text-tertiary)] truncate">
                      {a.contact_name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--text-secondary)]">{a.email}</span>
                  <Badge tone={a.candidate_count > 0 ? 'softAccent' : 'neutral'}>
                    {a.candidate_count} Bewerber
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
