import { redirect } from 'next/navigation';
import { darfUmsatz } from '@/lib/umsatz/zugriff';
import { UmsatzClient } from './umsatz-client';

export const dynamic = 'force-dynamic';

export default async function UmsatzPage() {
  if (!(await darfUmsatz())) redirect('/admin');
  return <UmsatzClient />;
}
