import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AkademieVerwaltung } from './verwaltung-client';

export const metadata = { title: 'Team-Akademie verwalten' };

export default async function AkademieVerwaltungPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/akademie');
  const { tab } = await searchParams;
  return <AkademieVerwaltung startTab={tab} />;
}
