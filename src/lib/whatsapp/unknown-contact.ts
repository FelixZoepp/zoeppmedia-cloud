import type { SupabaseClient } from '@supabase/supabase-js';

/** Markierung in candidates.consent_source: Kontakt hat uns zuerst per WhatsApp geschrieben */
export const WHATSAPP_INBOUND_SOURCE = 'whatsapp_inbound';

/** +4917612345678 → "+49 176 12345678" (nur für den Namen, wenn kein Profilname da ist) */
export function formatPhoneForName(e164: string): string {
  const m = e164.match(/^\+49(\d{3})(\d+)$/);
  return m ? `+49 ${m[1]} ${m[2]}` : e164;
}

/**
 * Unbekannte Nummer schreibt per WhatsApp: als Kontakt (Bewerber bzw. Sales-Lead) anlegen,
 * damit keine Nachricht verloren geht. Name = WhatsApp-Profilname, sonst die Nummer.
 * Wer uns selbst schreibt, darf im 24-h-Fenster eine Antwort bekommen → whatsapp_opt_in.
 */
export async function createContactFromWhatsApp(
  svc: SupabaseClient,
  agencyId: string,
  phoneE164: string,
  profileName: string | null,
): Promise<{ id: string; name: string; whatsapp_opt_in: boolean } | null> {
  // candidates.current_stage_id ist Pflicht – erste Stage als Einstieg
  const { data: stage } = await svc
    .from('pipeline_stages')
    .select('id')
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!stage) return null;

  const name = profileName?.trim() || formatPhoneForName(phoneE164);
  const { data, error } = await svc
    .from('candidates')
    .insert({
      agency_id: agencyId,
      name,
      phone: phoneE164,
      phone_e164: phoneE164,
      source: 'manual',
      current_stage_id: (stage as { id: string }).id,
      whatsapp_opt_in: true,
      consent_source: WHATSAPP_INBOUND_SOURCE,
      consent_at: new Date().toISOString(),
    })
    .select('id, name, whatsapp_opt_in')
    .single();

  if (error || !data) {
    // Paralleler Insert derselben Nummer → vorhandenen Kontakt nehmen
    const { data: existing } = await svc
      .from('candidates')
      .select('id, name, whatsapp_opt_in')
      .eq('agency_id', agencyId)
      .eq('phone_e164', phoneE164)
      .is('deleted_at', null)
      .maybeSingle();
    return (existing as { id: string; name: string; whatsapp_opt_in: boolean } | null) ?? null;
  }
  return data as { id: string; name: string; whatsapp_opt_in: boolean };
}
