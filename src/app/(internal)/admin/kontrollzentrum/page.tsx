import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeKontrollzentrum } from '@/lib/kontrollzentrum/laden';
import { KontrollzentrumClient } from './kontrollzentrum-client';

export const dynamic = 'force-dynamic';

/** Kontrollzentrum: alle Kunden auf einer Seite (Admin + Team, nur lesen) */
export default async function KontrollzentrumPage() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/login');

  const daten = await ladeKontrollzentrum(createAdminClient());
  return <KontrollzentrumClient daten={daten} />;
}
