import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AuditClient } from './audit-client';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect('/login');

  return <AuditClient />;
}
