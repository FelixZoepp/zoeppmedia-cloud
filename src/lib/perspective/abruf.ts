/**
 * Perspective-Abruf (alle 5 Minuten im Tick): Webhooks können ausbleiben oder falsch eingetragen sein.
 * Deshalb fragt die Cloud jeden fest zugeordneten Funnel (perspective_funnels) selbst ab und legt fehlende
 * Bewerber beim zugeordneten Kunden an. Grundlage ist allein die feste Zuordnung Funnel-ID → Kunde.
 * Nur Bewerbungen der letzten 14 Tage; ältere werden nicht nachgeholt. Nachgeholte Bewerber lösen keine
 * Automationen aus (keine Nachricht – Bewerber-Kontakt läuft nur über den freigegebenen Weg).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { PerspectiveMcp, PerspectiveNichtKonfiguriert } from './mcp-client';
import { legeFunnelLeadAn } from './leads';
import { schliessePruefstand } from '@/lib/zuordnung/pruefstand';

const LETZTER_LAUF_KEY = 'perspective_abruf_letzter_lauf';
const FENSTER_TAGE = 14;
const ZEITBUDGET_MS = 20_000;

interface Kontakt {
  id: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  utmParams?: Record<string, string> | null;
  meta?: { ps_converted_at?: string | null; ps_completed_at?: string | null } | null;
}

export interface AbrufErgebnis {
  funnels: number;
  neu: number;
  fehler: string[];
  verbunden: boolean;
}

/** Ist der Kontakt eine abgeschlossene Bewerbung im Zeitfenster? (rein, testbar) */
export function kontaktZaehlt(k: Kontakt, jetzt: Date, tage = FENSTER_TAGE): boolean {
  const t = k.meta?.ps_converted_at ?? k.meta?.ps_completed_at;
  if (!t) return false;
  if (!k.email && !k.phone) return false;
  return jetzt.getTime() - Date.parse(t) <= tage * 864e5;
}

async function speichere(svc: SupabaseClient, wert: unknown): Promise<void> {
  await svc.from('system_einstellungen').upsert({ key: LETZTER_LAUF_KEY, wert: JSON.stringify(wert), updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

export async function holePerspectiveBewerber(svc: SupabaseClient, jetzt: Date = new Date(), budgetMs = ZEITBUDGET_MS): Promise<AbrufErgebnis> {
  const ergebnis: AbrufErgebnis = { funnels: 0, neu: 0, fehler: [], verbunden: true };
  let mcp: PerspectiveMcp;
  try {
    mcp = await PerspectiveMcp.ausVerbindung(svc);
  } catch (err) {
    ergebnis.verbunden = false;
    ergebnis.fehler.push(err instanceof PerspectiveNichtKonfiguriert ? 'Perspective nicht verbunden' : String(err));
    await speichere(svc, { zeit: jetzt.toISOString(), ...ergebnis });
    return ergebnis;
  }

  // Am längsten nicht abgefragte Funnels zuerst – reicht die Zeit nicht, kommen die übrigen im nächsten Lauf dran
  const { data: funnels, error } = await svc
    .from('perspective_funnels')
    .select('id, agency_id, perspective_funnel_id, funnel_name')
    .not('funnel_name', 'is', null)
    .order('letzter_abgleich', { ascending: true, nullsFirst: true });
  if (error) throw new Error(`Funnel-Zuordnung nicht lesbar: ${error.message}`);
  const ende = Date.now() + Math.min(budgetMs, ZEITBUDGET_MS);

  const liste = (funnels ?? []) as Array<{ id: string; agency_id: string; perspective_funnel_id: string; funnel_name: string }>;
  for (const f of liste) {
    if (Date.now() > ende) {
      ergebnis.fehler.push(`${liste.length - ergebnis.funnels} Funnels aus Zeitgründen erst im nächsten Lauf`);
      break;
    }
    ergebnis.funnels++;
    try {
      const antwort = await mcp.tool('list_contacts', { funnelId: f.perspective_funnel_id, limit: 50, page: 0, sortField: 'ps_converted_at', sortOrder: '-1' });
      const kontakte = ((antwort.data ?? []) as Kontakt[]).filter((k) => kontaktZaehlt(k, jetzt));
      if (!kontakte.length) continue;
      const refs = kontakte.map((k) => `perspective:${k.id}`);
      const { data: schon } = await svc.from('candidates').select('externe_id').eq('agency_id', f.agency_id).in('externe_id', refs);
      const vorhanden = new Set(((schon ?? []) as Array<{ externe_id: string }>).map((x) => x.externe_id));
      // Liegt der Bewerber auf dem Prüfstand (Webhook-Kunde ≠ Funnel-Zuordnung), entscheidet nur der Admin – nicht der Abruf
      const { data: gesperrt } = await svc.from('bewerber_pruefstand').select('externe_ref').in('externe_ref', refs).in('status', ['offen', 'verworfen']);
      for (const g of (gesperrt ?? []) as Array<{ externe_ref: string }>) vorhanden.add(g.externe_ref);
      for (const k of kontakte) {
        if (vorhanden.has(`perspective:${k.id}`)) continue;
        const name = [k.firstName, k.lastName].filter(Boolean).join(' ').trim() || null;
        const r = await legeFunnelLeadAn(svc, f.agency_id, {
          name,
          email: k.email ?? null,
          phone: k.phone ?? null,
          funnelName: f.funnel_name,
          externeId: `perspective:${k.id}`,
          eingegangenAm: k.meta?.ps_converted_at ?? null,
          automationen: false,
          utm: k.utmParams ? { campaign: k.utmParams.utm_campaign ?? null, adset: k.utmParams.utm_term ?? null, ad: k.utmParams.utm_content ?? null, source: k.utmParams.utm_source ?? null } : null,
          nachweis: { quelle: 'perspective_abruf', pruefungen: [`Funnel „${f.funnel_name}“ fest diesem Kunden zugeordnet (Abruf)`], zeit: jetzt.toISOString() },
        });
        if (r.status === 'angelegt' || r.status === 'doppelt') await schliessePruefstand(svc, `perspective:${k.id}`, { agencyId: f.agency_id, candidateId: r.candidateId });
        if (r.status === 'angelegt') ergebnis.neu++;
        if (r.status === 'fehler') ergebnis.fehler.push(`${f.funnel_name}: ${r.fehler}`);
      }
    } catch (err) {
      ergebnis.fehler.push(`${f.funnel_name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await svc.from('perspective_funnels').update({ letzter_abgleich: jetzt.toISOString() }).eq('id', f.id);
  }
  await speichere(svc, { zeit: jetzt.toISOString(), ...ergebnis });
  return ergebnis;
}
