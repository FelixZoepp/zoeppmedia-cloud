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
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
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
          <FolderKanban className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            Noch keine Funnels erstellt
          </h2>
          <p className="text-gray-600">
            Funnels werden automatisch beim Fulfillment-Prozess angelegt.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {funnels.map((funnel) => {
            const badge = STATUS_BADGE[funnel.status] ?? STATUS_BADGE.draft;
            const isPublishing = publishing === funnel.id;

            return (
              <Card key={funnel.id} padding="md">
                <div className="flex items-center justify-between gap-4">
                  {/* Icon + info */}
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {funnel.name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {funnel.agencies?.name ?? '—'}
                      </p>
                      {funnel.url && (
                        <a
                          href={funnel.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline mt-0.5"
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
