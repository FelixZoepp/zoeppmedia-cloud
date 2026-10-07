import type { SupabaseClient } from '@supabase/supabase-js';
import { moveAd } from '@/lib/ads/ads';
import { anzeigeAlsText, type IndeedAnzeige } from './anzeige';

/**
 * Generierte Indeed-Anzeige als Ad-Karte (Typ „indeed“) ablegen:
 * noch nicht freigegeben → dieselbe Karte überarbeiten (zurück in die Bearbeitung), sonst neue Version.
 */
export async function speichereIndeedAnzeige(svc: SupabaseClient, agencyId: string, anzeige: IndeedAnzeige, userId: string | null): Promise<void> {
  const { data } = await svc
    .from('ad_items')
    .select('id, stage')
    .eq('agency_id', agencyId)
    .eq('typ', 'indeed')
    .neq('stage', 'verworfen')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const karte = data as { id: string; stage: string } | null;
  const felder = { titel: `Indeed: ${anzeige.titel}`, idee: anzeigeAlsText(anzeige), inhalt: anzeige, updated_at: new Date().toISOString() };
  if (karte && !['bereit', 'live'].includes(karte.stage)) {
    await svc.from('ad_items').update(felder).eq('id', karte.id);
    if (karte.stage !== 'bearbeitung') await moveAd(svc, karte.id, 'bearbeitung', { userId, kommentar: 'neu generiert' });
    return;
  }
  const { error } = await svc.from('ad_items').insert({ agency_id: agencyId, typ: 'indeed', stage: 'bearbeitung', assignee_id: userId, ...felder });
  if (error) throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
}
