'use client';

import { useEffect, useState } from 'react';
import { Globe, ExternalLink, Rocket, FolderKanban } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PerspectiveFunnel } from '@/lib/types/database';

type FunnelWithAgency = PerspectiveFunnel & {
  agencies?: { name: string } | null;
};

const STATUS_BADGE: Record<
  PerspectiveFunnel['status'],
  { label: string; tone: 'neutral' | 'success' | 'outline' }
> = {
  draft: { label: 'Entwurf', tone: 'neutral' },
  published: { label: 'Live', tone: 'success' },
  archived: { label: 'Archiviert', tone: 'outline' },
};

export default function FunnelsPage() {
  const [funnels, setFunnels] = useState<FunnelWithAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/perspective/funnels')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setFunnels(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handlePublish(funnelId: string) {
    setPublishing(funnelId);
    try {
      const res = await fetch('/api/perspective/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnel_id: funnelId }),
      });
      if (res.ok) {
        setFunnels((prev) =>
          prev.map((f) =>
            f.id === funnelId ? { ...f, status: 'published' as const } : f
          )
        );
      }
    } finally {
      setPublishing(null);
    }
  }

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
        label="FULFILLMENT"
        title="Funnels"
        description="Perspective Funnels verwalten und veröffentlichen"
        counter={`${funnels.length} gesamt`}
      />

      {funnels.length === 0 ? (
        <Card padding="lg" className="text-center">
          <FolderKanban className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-2">
            Noch keine Funnels erstellt
          </h2>
          <p className="text-[var(--text-secondary)]">
            Funnels werden automatisch beim Fulfillment-Prozess angelegt.
          </p>
        </Card>
      ) : (
        <div className="grid gap-5">
          {funnels.map((funnel) => {
            const badge = STATUS_BADGE[funnel.status] ?? STATUS_BADGE.draft;
            const isPublishing = publishing === funnel.id;

            return (
              <Card key={funnel.id} padding="md">
                <div className="flex items-center justify-between gap-6">
                  {/* Icon + info */}
                  <div className="flex items-center gap-6 min-w-0">
                    <div className="w-10 h-10 rounded-[var(--radius-md)] bg-red-50 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-5 h-5 text-[#E31B23]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
                        {funnel.name}
                      </p>
                      <p className="text-[13px] text-[var(--text-tertiary)] truncate">
                        {funnel.agencies?.name ?? '—'}
                      </p>
                      {funnel.url && (
                        <a
                          href={funnel.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] text-[#E31B23] hover:underline mt-0.5"
                        >
                          {funnel.url}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Status + action */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    {funnel.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={isPublishing}
                        onClick={() => handlePublish(funnel.id)}
                      >
                        <Rocket className="w-3.5 h-3.5" />
                        {isPublishing ? 'Wird veröffentlicht…' : 'Veröffentlichen'}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
