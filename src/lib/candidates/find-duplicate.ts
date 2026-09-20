import { SupabaseClient } from '@supabase/supabase-js';

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '');
}

/**
 * Prüft, ob für diese Agentur bereits ein Bewerber mit gleicher
 * E-Mail (case-insensitive) oder Telefonnummer (normalisiert) existiert.
 */
export async function findDuplicateCandidate(
  supabase: SupabaseClient,
  agencyId: string,
  email: string | null,
  phone: string | null
): Promise<{ id: string; name: string } | null> {
  if (email) {
    const { data } = await supabase
      .from('candidates')
      .select('id, name')
      .eq('agency_id', agencyId)
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (phone) {
    const normalized = normalizePhone(phone);
    const { data } = await supabase
      .from('candidates')
      .select('id, name, phone')
      .eq('agency_id', agencyId)
      .not('phone', 'is', null);
    const match = data?.find((c) => c.phone && normalizePhone(c.phone) === normalized);
    if (match) return { id: match.id, name: match.name };
  }

  return null;
}
