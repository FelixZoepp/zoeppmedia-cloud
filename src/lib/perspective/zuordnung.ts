/**
 * Doppelter Boden für Funnel-Bewerber: Der Kunde aus dem Webhook-Link (?agency=) muss mit der festen
 * Funnel-Zuordnung (perspective_funnels: Funnel-ID/-Name → Kunde) übereinstimmen. Sonst Prüfstand statt Kunde.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface FunnelZeile {
  agency_id: string;
  perspective_funnel_id: string;
  funnel_name: string | null;
}

export type FunnelEntscheidung =
  | { ok: true; pruefungen: string[] }
  | { ok: false; grund: string; vorschlag: string | null };

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Rein, testbar: passt der Webhook-Kunde zur festen Funnel-Zuordnung? */
export function funnelEntscheidung(zeilen: FunnelZeile[], agencyId: string, funnelName: string | null, funnelId: string | null): FunnelEntscheidung {
  const treffer = zeilen.filter((z) => (funnelId && z.perspective_funnel_id === funnelId) || (funnelName && norm(z.funnel_name) === norm(funnelName)));
  const kunden = [...new Set(treffer.map((z) => z.agency_id))];
  if (!treffer.length) return { ok: false, grund: `Funnel „${funnelName ?? funnelId ?? '?'}“ ist keinem Kunden fest zugeordnet`, vorschlag: agencyId };
  if (kunden.length > 1) return { ok: false, grund: `Funnel „${funnelName ?? funnelId}“ ist mehreren Kunden zugeordnet`, vorschlag: null };
  if (kunden[0] !== agencyId) return { ok: false, grund: `Webhook-Link zeigt auf einen anderen Kunden als die feste Zuordnung des Funnels „${funnelName ?? funnelId}“`, vorschlag: kunden[0] };
  return { ok: true, pruefungen: ['Webhook-Link = Kunde', `Funnel „${funnelName ?? funnelId}“ fest diesem Kunden zugeordnet`] };
}

export async function pruefeFunnelKunde(svc: SupabaseClient, agencyId: string, funnelName: string | null, funnelId: string | null): Promise<FunnelEntscheidung> {
  const { data, error } = await svc.from('perspective_funnels').select('agency_id, perspective_funnel_id, funnel_name');
  if (error) throw new Error(`Funnel-Zuordnung nicht lesbar: ${error.message}`);
  return funnelEntscheidung((data ?? []) as FunnelZeile[], agencyId, funnelName, funnelId);
}
