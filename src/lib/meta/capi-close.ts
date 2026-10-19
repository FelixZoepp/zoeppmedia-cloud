/**
 * Close-Webhook (Opportunity) → Meta-Ereignis? (rein, testbar)
 *  - in „Closing – Terminiert“ (neu angelegt oder aus einer anderen Stufe) → QualifiedLead, einmal je Deal
 *  - auf „Close“ (gewonnen, D2D) → Purchase mit Auftragswert, einmal je Deal
 * Upsell-Deals (eigene Pipeline) melden wir nicht: Die Werbung soll auf Neukunden optimieren.
 */

import { OPP_GEWONNEN } from '@/lib/sales/deal-feier';
import type { CapiEreignis } from './capi';

export const OPP_CLOSING_TERMINIERT = 'stat_RjrZL3ifb4mKNiPEFFX1IQgse1fbI94R9XZgere2wZT';

type Ereignis = {
  object_type?: string;
  object_id?: string;
  action?: string;
  changed_fields?: string[];
  data?: { status_id?: string; value?: number | null };
  previous_data?: { status_id?: string };
};

export function capiAusCloseEreignis(ev: Ereignis | undefined): { name: CapiEreignis; eventId: string; oppId: string; wert?: number } | null {
  if (ev?.object_type !== 'opportunity' || !ev.object_id) return null;
  const status = ev.data?.status_id;
  const wechsel = ev.action === 'created' || (ev.action === 'updated' && (ev.changed_fields ?? []).includes('status_id') && ev.previous_data?.status_id !== status);
  if (!wechsel) return null;
  if (status === OPP_CLOSING_TERMINIERT) return { name: 'QualifiedLead', eventId: `qualified_${ev.object_id}`, oppId: ev.object_id };
  if (status === OPP_GEWONNEN) return { name: 'Purchase', eventId: `purchase_${ev.object_id}`, oppId: ev.object_id, wert: Math.round((ev.data?.value ?? 0) / 100) };
  return null;
}
