import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotificationForAgency } from '@/lib/notifications/create';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';
import { berechneRoi } from './berechnung';
import { ladeEinstellungen, ladeUmsaetze } from './laden';

const TITEL = 'Umsätze deiner neuen Vertriebler eintragen';

/**
 * Am 1.–5. eines Monats: Kunden erinnern, deren Vertriebler-Umsätze für den Vormonat fehlen.
 * Höchstens einmal pro Tag und Kunde. Liefert die Anzahl erinnerter Kunden.
 */
export async function erinnereFehlendeUmsaetze(svc: SupabaseClient, jetzt: Date = new Date()): Promise<number> {
  const tag = Number(jetzt.toLocaleDateString('de-DE', { day: 'numeric', timeZone: 'Europe/Berlin' }));
  if (tag < 1 || tag > 5) return 0;
  const heuteStart = new Date(`${jetzt.toISOString().slice(0, 10)}T00:00:00Z`).toISOString();

  const { data: ags } = await svc
    .from('agencies')
    .select('id, name, fulfillment_phase')
    .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`);
  let erinnert = 0;
  for (const a of (ags ?? []) as Array<{ id: string; name: string; fulfillment_phase: string | null }>) {
    if (a.fulfillment_phase === 'beendet') continue;
    const [einstellungen, eintraege] = await Promise.all([ladeEinstellungen(svc, a.id), ladeUmsaetze(svc, a.id)]);
    if (!einstellungen.length) continue;
    const { fehlend, letzterMonat } = berechneRoi({ einstellungen, eintraege, kosten: { mrr: null, werbebudget: null, start: null }, jetzt });
    if (!fehlend.length) continue;

    const { data: schon } = await svc.from('notifications').select('id').eq('agency_id', a.id).eq('title', TITEL).gte('created_at', heuteStart).limit(1).maybeSingle();
    if (schon) continue;

    const monat = new Date(`${letzterMonat}T12:00:00Z`).toLocaleDateString('de-DE', { month: 'long', timeZone: 'Europe/Berlin' });
    await createNotificationForAgency(svc, a.id, {
      title: TITEL,
      body: `Für ${monat} fehlen noch ${fehlend.length} Einträge (${fehlend.slice(0, 3).map((f) => f.name).join(', ')}${fehlend.length > 3 ? ' …' : ''}). Dauert 2 Minuten.`,
      type: 'system',
      push_url: '/umsaetze',
    });
    erinnert++;
  }
  return erinnert;
}
