'use client';

import { Card, PageHeader } from '@/components/ui';
import { KalenderVerbinden } from '@/components/kalender/kalender-verbinden';

export default function KalenderSeite() {
  return (
    <div className="max-w-2xl">
      <PageHeader label="EINSTELLUNGEN" title="Kalender" description="Verbinde deinen Kalender – Google, Outlook oder Apple: Wir sehen deine freien Zeiten und tragen Vorstellungsgespräche und Probetage direkt bei dir ein." />
      <Card>
        <KalenderVerbinden />
      </Card>
    </div>
  );
}
