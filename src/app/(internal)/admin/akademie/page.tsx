import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AkademieVerwaltung } from './verwaltung-client';

export const metadata = { title: 'Team-Akademie verwalten' };

export default async function AkademieVerwaltungPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/akademie');
  return <AkademieVerwaltung />;
}
