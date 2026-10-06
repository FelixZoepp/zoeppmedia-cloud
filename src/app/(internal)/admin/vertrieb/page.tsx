import { redirect } from 'next/navigation';
import { darfSalesControlling } from '@/lib/sales-controlling/zugriff';
import { VertriebClient } from './vertrieb-client';

export const dynamic = 'force-dynamic';

export default async function VertriebPage() {
  if (!(await darfSalesControlling())) redirect('/admin');
  return <VertriebClient />;
}
