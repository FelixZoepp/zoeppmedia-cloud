import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin';
import { logAudit } from '@/lib/audit/log';
import { IMPERSONATION_COOKIE } from '@/lib/recruiting/scope';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';

/**
 * Öffnet die WhatsApp-Inbox der internen Sales-Agency (Zoepp Media Intern).
 * Setzt dafür das Impersonation-Cookie und leitet auf /inbox weiter —
 * Ziel der Sidebar und der Push-Links bei Prospect-Antworten.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerClient();

  if (!(await isAdmin(supabase))) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { data: { user } } = await supabase.auth.getUser();

  await logAudit(createAdminClient(), {
    user_id: user?.id ?? null,
    agency_id: SALES_AGENCY_ID,
    entity_type: 'agency',
    entity_id: SALES_AGENCY_ID,
    action: 'impersonate',
    changes: [{ field: 'impersonation', old: null, new: 'sales-inbox' }],
    ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
    user_agent: request.headers.get('user-agent') ?? null,
  });

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, SALES_AGENCY_ID, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 3600,
    secure: process.env.NODE_ENV === 'production',
  });

  const target = new URL('/inbox', request.url);
  const conversation = request.nextUrl.searchParams.get('conversation');
  if (conversation) target.searchParams.set('conversation', conversation);
  return NextResponse.redirect(target);
}
