'use client';

import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Users } from 'lucide-react';

export default function TeamPage() {
  return (
    <div>
      <PageHeader label="COCKPIT" title="Team" />
      <Card padding="lg" className="text-center">
        <Users className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
        <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-2">Kommt bald</h2>
        <p className="text-[var(--text-secondary)]">Die Teamverwaltung wird gerade entwickelt.</p>
      </Card>
    </div>
  );
}
