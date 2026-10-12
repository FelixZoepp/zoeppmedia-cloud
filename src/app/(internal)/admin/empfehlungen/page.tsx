import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { EmpfehlungenClient } from './empfehlungen-client';

export const dynamic = 'force-dynamic';

export default async function EmpfehlungenPage() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) redirect('/login');
  return <EmpfehlungenClient />;
}
