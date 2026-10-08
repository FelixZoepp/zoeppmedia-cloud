import { SupabaseClient } from '@supabase/supabase-js';
import {
  checkStille,
  checkWerbekonto,
  checkPixel,
  checkCanary,
  type CheckTyp,
  type CheckResult,
} from './checks';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';

const CHECK_RUNNERS: Record<CheckTyp, (s: SupabaseClient, id: string) => Promise<CheckResult>> = {
  stille: checkStille,
  werbekonto: checkWerbekonto,
  pixel: checkPixel,
  canary_bewerbung: checkCanary,
};

/**
 * Täglicher Lauf: alle Kunden mit laufender Kampagne (Fulfillment-Phase Continuity).
 * Früher über agencies.status = 'aktiv' – diese Spalte gibt es seit Fulfillment v2 nicht mehr.
 */
export async function runHealthChecks(supabase: SupabaseClient): Promise<number> {
  const { data: agencies, error } = await supabase
    .from('agencies')
    .select('id, name')
    .eq('fulfillment_phase', 'continuity')
    .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`);
  if (error) {
    console.error('[health] Kunden konnten nicht geladen werden', error);
    return 0;
  }
  for (const agency of agencies ?? []) {
    await runChecksForAgency(supabase, agency.id, agency.name);
  }
  return agencies?.length ?? 0;
}

export async function runChecksForAgency(
  supabase: SupabaseClient,
  agencyId: string,
  agencyName?: string,
) {
  const name = agencyName || agencyId;
  const now = new Date().toISOString();
  const checkTypes = Object.keys(CHECK_RUNNERS) as CheckTyp[];

  for (const typ of checkTypes) {
    const runner = CHECK_RUNNERS[typ];
    let result: CheckResult;

    try {
      result = await runner(supabase, agencyId);
    } catch {
      result = {
        ergebnis: 'fehler',
        details: { hinweis: 'Check konnte nicht ausgefuehrt werden' },
      };
    }

    // Insert result into health_checks
    const { error: insertError } = await supabase.from('health_checks').insert({
      agency_id: agencyId,
      typ,
      gelaufen_am: now,
      ergebnis: result.ergebnis,
      details: result.details,
    });
    if (insertError) console.error('[health] Ergebnis nicht gespeichert', typ, agencyId, insertError);

    // Notify on fehler – nur wenn dazu noch keine offene Aufgabe existiert (Check läuft täglich)
    if (result.ergebnis === 'fehler') {
      const titel = `Health-Check Fehler: ${typ}`;
      const { data: offen } = await supabase
        .from('project_tasks')
        .select('id')
        .eq('agency_id', agencyId)
        .eq('titel', titel)
        .not('status', 'in', '(erledigt,nicht_noetig)')
        .limit(1);
      if (offen && offen.length > 0) continue;

      await createNotificationForInternals(supabase, {
        title: `Health-Check Fehler: ${typ} bei ${name}`,
        body: (result.details.hinweis as string) || `${typ}-Check hat einen Fehler ergeben`,
        type: 'system',
        entity_type: 'agency',
        entity_id: agencyId,
      });

      // Create internal task
      await supabase.from('project_tasks').insert({
        agency_id: agencyId,
        titel,
        beschreibung: (result.details.hinweis as string) || `${typ}-Check hat einen Fehler ergeben. Bitte pruefen.`,
        status: 'offen',
        faellig_am: new Date().toISOString().split('T')[0],
      });
    }

    // Notify on warnung (no task)
    if (result.ergebnis === 'warnung') {
      await createNotificationForInternals(supabase, {
        title: `Health-Check Warnung: ${typ} bei ${name}`,
        body: (result.details.hinweis as string) || `${typ}-Check hat eine Warnung ergeben`,
        type: 'system',
        entity_type: 'agency',
        entity_id: agencyId,
      });
    }
  }
}
