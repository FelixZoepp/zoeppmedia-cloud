import type { SupabaseClient } from '@supabase/supabase-js';
import { ladeErgebnisse } from '@/lib/kunden-cloud/ergebnisse';
import { ladeArbeit } from '@/lib/kunden-cloud/uebersicht';
import { berechneEmpfehlungen, type KundenLage } from './regeln';
import { personaAusSettings } from '@/lib/persona/konfig';

/** Lage eines Kunden aus der Cloud zusammenstellen */
export async function ladeKundenLage(svc: SupabaseClient, agencyId: string): Promise<KundenLage | null> {
  const vor30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const [ergebnisse, arbeit, { data: ag }, { data: wa }, { data: onb }, { count: funnels }, { count: lektionen }, { count: gesehen }, { count: personaTests }] = await Promise.all([
    ladeErgebnisse(svc),
    ladeArbeit(svc),
    svc.from('agencies').select('paket, settings').eq('id', agencyId).maybeSingle(),
    svc.from('whatsapp_accounts').select('status').eq('agency_id', agencyId).eq('status', 'connected').limit(1).maybeSingle(),
    svc.from('onboarding_submissions').select('career_page_url, website_url').eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    svc.from('perspective_funnels').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId),
    svc.from('masterclass_lessons').select('id', { count: 'exact', head: true }),
    svc.from('agency_lesson_progress').select('lesson_id', { count: 'exact', head: true }).eq('agency_id', agencyId).eq('watched', true),
    svc.from('candidates').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId).gte('persona_eingeladen_am', vor30),
  ]);
  const e = ergebnisse.find((x) => x.id === agencyId);
  if (!e) return null;
  const a = arbeit.find((x) => x.id === agencyId);
  const o = onb as { career_page_url: string | null; website_url: string | null } | null;
  return {
    paket: (ag as { paket: string | null } | null)?.paket ?? null,
    personaFreigeschaltet: !!personaAusSettings((ag as { settings: unknown } | null)?.settings).aktiv,
    personaTests30: personaTests ?? 0,
    phase: e.phase,
    bewerber30: e.bewerber30,
    bewerberVorher: e.bewerberVorher,
    bewerber7: e.bewerber7,
    offen: a?.zuBearbeiten ?? 0,
    ohneKontakt: a?.ohneKontakt ?? 0,
    kontaktquote: e.kontaktquote,
    speedToLeadMin: e.speedToLeadMin,
    anrufe30: e.anrufe30,
    erreichbarkeit: e.erreichbarkeit,
    termine30: e.termine30,
    noShows30: e.noShows30,
    einstellungen30: e.einstellungen30,
    whatsappVerbunden: !!wa,
    karriereseite: !!(o?.career_page_url || o?.website_url || funnels),
    masterclassFortschritt: lektionen ? Math.round(((gesehen ?? 0) / lektionen) * 100) : null,
  };
}

export async function ladeEmpfehlungen(svc: SupabaseClient, agencyId: string) {
  const lage = await ladeKundenLage(svc, agencyId);
  return { lage, empfehlungen: lage ? berechneEmpfehlungen(lage) : [] };
}
