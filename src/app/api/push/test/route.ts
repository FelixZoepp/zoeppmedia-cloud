import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { pushEingerichtet, sendPushToUsers } from '@/lib/push/send';

/** Stand der Push-Benachrichtigungen des eingeloggten Users */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { count } = await createAdminClient().from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
  return NextResponse.json({ eingerichtet: pushEingerichtet(), geraete: count ?? 0 });
}

/** Test-Benachrichtigung nur an die eigenen Geräte */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!pushEingerichtet()) return NextResponse.json({ eingerichtet: false, gesendet: 0 });
  const gesendet = await sendPushToUsers([user.id], {
    title: '✅ Benachrichtigungen funktionieren',
    body: 'So erfährst du ab jetzt sofort, wenn ein neuer Bewerber reinkommt.',
    url: '/dashboard',
  });
  return NextResponse.json({ eingerichtet: true, gesendet });
}
