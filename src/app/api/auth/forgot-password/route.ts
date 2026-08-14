import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ ok: true }); // Always return success
  }

  const supabase = await createServerClient();

  // Fire-and-forget — don't reveal whether email exists
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
