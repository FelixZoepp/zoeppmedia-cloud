import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendOnboardingReminder } from '@/lib/email/resend';

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Find agencies where onboarding not completed and created > 48h ago
  const { data: agencies } = await supabase
    .from('agencies')
    .select('id, name, created_at, onboarding_completed')
    .eq('onboarding_completed', false)
    .lt('created_at', cutoff);

  if (!agencies || agencies.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;

  for (const agency of agencies) {
    // Check if we already sent a reminder (check inbound_email_log or use a simple flag)
    // Get the agency owner's email
    const { data: owner } = await supabase
      .from('users')
      .select('email, name')
      .eq('agency_id', agency.id)
      .eq('role', 'agency_owner')
      .limit(1)
      .single();

    if (!owner) continue;

    try {
      await sendOnboardingReminder(owner.email, owner.name, `${appUrl}/onboarding`);
      sent++;
    } catch {
      // Email failed — skip this agency
    }
  }

  return NextResponse.json({ sent, checked: agencies.length });
}
