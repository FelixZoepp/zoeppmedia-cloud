import { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhoneE164 } from '@/lib/phone';

/** „_“ und „%“ sind bei ilike Platzhalter – für einen exakten Vergleich maskieren */
export function ilikeExakt(wert: string): string {
  return wert.replace(/[\\%_]/g, (z) => `\\${z}`);
}

/**
 * Prüft, ob für diese Agentur bereits ein Bewerber mit gleicher
 * E-Mail (case-insensitive) oder Telefonnummer (E.164) existiert.
 */
export async function findDuplicateCandidate(
  supabase: SupabaseClient,
  agencyId: string,
  email: string | null,
  phone: string | null
): Promise<{ id: string; name: string } | null> {
  if (email?.trim()) {
    const { data } = await supabase
      .from('candidates')
      .select('id, name')
      .eq('agency_id', agencyId)
      .ilike('email', ilikeExakt(email.trim()))
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  const e164 = normalizePhoneE164(phone);
  if (e164) {
    const { data } = await supabase
      .from('candidates')
      .select('id, name')
      .eq('agency_id', agencyId)
      .eq('phone_e164', e164)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}
