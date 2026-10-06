import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, getEffectiveAgencyId, isInternal } from '@/lib/auth';
import { DialerClient } from '@/components/dialer/dialer-client';
import { Card, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Anruf-Modus der Kunden-Cloud: Bewerber dieses Kunden der Reihe nach abtelefonieren. */
export default async function AnrufenPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Intern ohne geöffnete Kunden-Cloud: erst einen Kunden wählen
  const agencyId = await getEffectiveAgencyId();
  if (isInternal(user.role) && (!agencyId || agencyId === user.agency_id)) {
    return (
      <div className="max-w-3xl">
        <PageHeader label="ANRUF-MODUS" title="Anrufen" />
        <Card>
          <p className="text-[15px] text-gray-700">
            Öffne zuerst die Cloud eines Kunden – dann erscheinen hier seine Bewerber zum Abtelefonieren.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-[14px] font-medium">
            <Link href="/innendienst" className="text-red-800 hover:underline">
              Zur Innendienst-Übersicht
            </Link>
            <Link href="/dialer" className="text-red-800 hover:underline">
              Interner Dialer über alle Kunden
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return <DialerClient modus="portal" />;
}
