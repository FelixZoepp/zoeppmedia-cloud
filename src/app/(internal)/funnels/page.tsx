'use client';

import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { FolderKanban } from 'lucide-react';

export default function FunnelsPage() {
  return (
    <div>
      <PageHeader label="FULFILLMENT" title="Funnels" />
      <Card padding="lg" className="text-center">
        <FolderKanban className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
        <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-2">Kommt bald</h2>
        <p className="text-[var(--text-secondary)]">Die Funnel-Verwaltung wird gerade entwickelt.</p>
      </Card>
    </div>
  );
}
