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

const CHECK_RUNNERS: Record<CheckTyp, (s: SupabaseClient, id: string) => Promise<CheckResult>> = {
  stille: checkStille,
  werbekonto: checkWerbekonto,
  pixel: checkPixel,
  canary_bewerbung: checkCanary,
};

export async function runHealthChecks(supabase: SupabaseClient) {
  // Get all active agencies
  const { data: agencies } = await supabase
    .from('agencies')
    .select('id, name')
    .eq('status', 'aktiv');

  if (!agencies?.length) return;

  for (const agency of agencies) {
    await runChecksForAgency(supabase, agency.id, agency.name);
  }
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
    await supabase.from('health_checks').insert({
      agency_id: agencyId,
      typ,
      gelaufen_am: now,
      ergebnis: result.ergebnis,
      details: result.details,
    });

    // Notify on fehler
    if (result.ergebnis === 'fehler') {
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
        titel: `Health-Check Fehler: ${typ}`,
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
