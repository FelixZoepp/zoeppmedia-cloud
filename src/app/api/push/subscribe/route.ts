import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/** Speichert eine Web-Push-Subscription für den eingeloggten User. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const endpoint: string | undefined = body?.endpoint;
  const p256dh: string | undefined = body?.keys?.p256dh;
  const auth: string | undefined = body?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Ungültige Subscription' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get('user-agent'),
    },
    { onConflict: 'endpoint' }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

/** Entfernt eine Subscription (z.B. bei Abmeldung der Benachrichtigungen). */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const endpoint: string | undefined = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: 'endpoint fehlt' }, { status: 400 });

  const admin = createAdminClient();
  await admin.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id);
  return NextResponse.json({ success: true });
}
