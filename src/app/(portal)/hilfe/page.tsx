import { redirect } from 'next/navigation';
import { getCurrentUser, getEffectiveAgencyId, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { audienceFor } from '@/lib/help/articles';
import { HilfeClient, type Ansprechpartner } from './hilfe-client';

/** Hilfe-Center für alle Rollen (liegt im Portal-Layout, das jede angemeldete Rolle nutzt). */
export default async function HilfePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const audience = audienceFor(user.role);

  // Kunden: ihren Ansprechpartner bei Zoepp Media zeigen (agencies.csm_user_id), falls hinterlegt
  let kontakt: Ansprechpartner | null = null;
  if (!isInternal(user.role)) {
    const agencyId = await getEffectiveAgencyId();
    if (agencyId) {
      const svc = createAdminClient();
      const { data: agency } = await svc.from('agencies').select('csm_user_id').eq('id', agencyId).maybeSingle();
      const csm = (agency as { csm_user_id: string | null } | null)?.csm_user_id;
      if (csm) {
        const { data: u } = await svc.from('users').select('name, email, phone, avatar_url, calendly_link, position').eq('id', csm).maybeSingle();
        if (u) kontakt = u as Ansprechpartner;
      }
    }
  }

  return <HilfeClient audience={audience} kontakt={kontakt} />;
}
