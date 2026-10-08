import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, clientIp } from '@/lib/security/rate-limit';

export async function POST(request: Request) {
  const { email } = await request.json().catch(() => ({}));

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();

  // Gegen Mail-Bombing: höchstens 5 Anfragen pro IP und 3 pro Adresse je Stunde.
  // Antwort bleibt gleich, damit nicht verraten wird, ob die Adresse existiert.
  const adresse = email.trim().toLowerCase();
  const [ipOk, mailOk] = await Promise.all([
    checkRateLimit(supabase, `forgot:ip:${clientIp(request.headers)}`, 5, 3600),
    checkRateLimit(supabase, `forgot:mail:${adresse}`, 3, 3600),
  ]);
  if (!ipOk || !mailOk) return NextResponse.json({ ok: true });

  // Fire-and-forget — don't reveal whether email exists
  await supabase.auth.resetPasswordForEmail(adresse, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de'}/reset-password`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
