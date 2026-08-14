import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();

  // Fire-and-forget — don't reveal whether email exists
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de'}/reset-password`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
