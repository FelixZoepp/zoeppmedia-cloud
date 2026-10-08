import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { TeamFortschritt } from './team-client';

export const metadata = { title: 'Akademie: Team-Fortschritt & Reviews' };

export default async function AkademieTeamPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/akademie');
  return <TeamFortschritt />;
}
