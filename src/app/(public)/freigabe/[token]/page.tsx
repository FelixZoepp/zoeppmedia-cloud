import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeFreigabe } from '@/lib/videos/freigabe';
import { KundenFreigabe } from '@/components/videos/kunden-freigabe';

export const metadata = { title: 'Video-Freigabe – Zoepp Media', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function FreigabePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const daten = await ladeFreigabe(createAdminClient(), token);
  if (!daten) notFound();
  return <KundenFreigabe start={daten} />;
}
