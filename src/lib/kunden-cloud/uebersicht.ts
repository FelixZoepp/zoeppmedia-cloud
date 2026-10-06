import type { SupabaseClient } from '@supabase/supabase-js';
import { agencyLogo } from '@/lib/branding/logo';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';
import { mitInnendienst } from '@/lib/fulfillment/pakete';

/** Innendienst-Übersicht: je Kunde, was in seiner Cloud gerade zu tun ist. */

export interface KundeArbeit {
  id: string;
  name: string;
  /** für den Kunden-Login-Link /k/<slug> */
  slug: string | null;
  logo_url: string | null;
  phase: string | null;
  pausiert: boolean;
  /** Bewerber in der Eingangs-Stufe (noch nicht weiterbearbeitet) */
  zuBearbeiten: number;
  /** davon noch kein Kontaktversuch */
  ohneKontakt: number;
  /** heute eingegangen */
  neuHeute: number;
  /** letzte 7 Tage eingegangen */
  neu7Tage: number;
  /** Anruf laut Nachfass-Kadenz jetzt fällig */
  anrufeFaellig: number;
  /** ungelesene WhatsApp-Nachrichten */
  ungelesen: number;
  /** ältester Bewerber ohne Kontakt (ISO) */
  aeltesterOhneKontakt: string | null;
  /** Dringlichkeit zum Sortieren */
  prio: number;
}

type Kandidat = {
  agency_id: string;
  current_stage_id: string | null;
  created_at: string;
  first_contact_at: string | null;
  erster_kontaktversuch_am: string | null;
  cadence_active: boolean | null;
  cadence_next_at: string | null;
  blacklisted: boolean | null;
};

export function berechneArbeit(
  agencies: Array<{ id: string; name: string; slug?: string | null; settings: unknown; fulfillment_phase: string | null; pausiert_grund: string | null }>,
  kandidaten: Kandidat[],
  stageTyp: Map<string, string | null>,
  ungelesen: Map<string, number>,
  jetzt: Date,
): KundeArbeit[] {
  const heute = jetzt.toISOString().slice(0, 10);
  const vor7 = new Date(jetzt.getTime() - 7 * 864e5).toISOString();
  const jetztIso = jetzt.toISOString();

  return agencies
    .map((a) => {
      const meine = kandidaten.filter((k) => k.agency_id === a.id && !k.blacklisted);
      const eingang = meine.filter((k) => !k.current_stage_id || stageTyp.get(k.current_stage_id) === 'new');
      const ohne = eingang.filter((k) => !k.first_contact_at && !k.erster_kontaktversuch_am);
      const anrufe = meine.filter((k) => k.cadence_active && k.cadence_next_at && k.cadence_next_at <= jetztIso).length;
      const offenNachrichten = ungelesen.get(a.id) ?? 0;
      const aeltester = ohne.map((k) => k.created_at).sort()[0] ?? null;
      const wartetStunden = aeltester ? (jetzt.getTime() - new Date(aeltester).getTime()) / 36e5 : 0;
      return {
        id: a.id,
        name: a.name,
        slug: a.slug ?? null,
        logo_url: agencyLogo(a.settings),
        phase: a.fulfillment_phase,
        pausiert: !!a.pausiert_grund,
        zuBearbeiten: eingang.length,
        ohneKontakt: ohne.length,
        neuHeute: meine.filter((k) => k.created_at.slice(0, 10) === heute).length,
        neu7Tage: meine.filter((k) => k.created_at >= vor7).length,
        anrufeFaellig: anrufe,
        ungelesen: offenNachrichten,
        aeltesterOhneKontakt: aeltester,
        // Ohne Kontakt wiegt am schwersten (Speed-to-Lead), lange Wartezeit zusätzlich
        prio: ohne.length * 3 + offenNachrichten * 2 + anrufe * 2 + eingang.length + Math.min(48, wartetStunden) / 12,
      };
    })
    // Pausierte Kunden nach hinten, sonst nach Dringlichkeit
    .sort((x, y) => Number(x.pausiert) - Number(y.pausiert) || y.prio - x.prio || x.name.localeCompare(y.name, 'de'));
}

export async function ladeArbeit(svc: SupabaseClient, jetzt: Date = new Date()): Promise<KundeArbeit[]> {
  const [{ data: ags }, { data: stages }, { data: convs }] = await Promise.all([
    svc
      .from('agencies')
      .select('id, name, slug, settings, fulfillment_phase, pausiert_grund, bausteine')
      .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`)
      .order('name'),
    svc.from('pipeline_stages').select('id, stage_type'),
    svc.from('conversations').select('agency_id, unread_count').gt('unread_count', 0),
  ]);

  // Bewerber seitenweise laden (Supabase liefert max. 1000 pro Abfrage)
  const kandidaten: Kandidat[] = [];
  for (let von = 0; von < 50_000; von += 1000) {
    const { data, error } = await svc
      .from('candidates')
      .select('agency_id, current_stage_id, created_at, first_contact_at, erster_kontaktversuch_am, cadence_active, cadence_next_at, blacklisted')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .range(von, von + 999);
    if (error) throw new Error(`Bewerber konnten nicht geladen werden: ${error.message}`);
    kandidaten.push(...((data ?? []) as Kandidat[]));
    if (!data || data.length < 1000) break;
  }

  const ungelesen = new Map<string, number>();
  for (const c of (convs ?? []) as Array<{ agency_id: string; unread_count: number }>) {
    ungelesen.set(c.agency_id, (ungelesen.get(c.agency_id) ?? 0) + (c.unread_count ?? 0));
  }

  return berechneArbeit(
    // Nur Kunden, deren Bewerber wir bearbeiten (Baustein Innendienst; Bestandskunden ohne Angabe wie bisher)
    ((ags ?? []) as Array<Parameters<typeof berechneArbeit>[0][number] & { bausteine: unknown }>).filter(
      (a) => a.fulfillment_phase !== 'beendet' && mitInnendienst(a.bausteine),
    ),
    kandidaten,
    new Map(((stages ?? []) as Array<{ id: string; stage_type: string | null }>).map((s) => [s.id, s.stage_type])),
    ungelesen,
    jetzt,
  );
}
