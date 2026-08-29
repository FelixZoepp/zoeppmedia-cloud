import { SupabaseClient } from '@supabase/supabase-js';
import { generateReport } from './generate-report';
import { createNotificationForInternals } from '@/lib/notifications/create';

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

export async function checkAndGenerateReports(supabase: SupabaseClient) {
  const today = new Date();
  const todayStr = toDateString(today);

  // Get all agencies with garantie_start set
  const { data: agencies } = await supabase
    .from('agencies')
    .select('id, name, garantie_start')
    .not('garantie_start', 'is', null);

  if (!agencies?.length) return;

  for (const agency of agencies) {
    const start = new Date(agency.garantie_start);

    // Check Tag-7: garantie_start + 7 days
    const tag7Date = new Date(start);
    tag7Date.setDate(tag7Date.getDate() + 7);

    if (toDateString(tag7Date) === todayStr) {
      // Check if report already exists
      const { data: existing } = await supabase
        .from('reports')
        .select('id')
        .eq('agency_id', agency.id)
        .eq('typ', 'tag_7')
        .limit(1);

      if (!existing?.length) {
        try {
          const daten = await generateReport(supabase, agency.id, 'tag_7');
          await supabase.from('reports').insert({
            agency_id: agency.id,
            typ: 'tag_7',
            stichtag: todayStr,
            status: 'generiert',
            daten_json: daten,
          });

          await createNotificationForInternals(supabase, {
            title: `Tag-7 Report fuer ${agency.name} bereit zur Freigabe`,
            body: `Der Tag-7 Report wurde automatisch generiert und wartet auf Freigabe.`,
            type: 'system',
            entity_type: 'agency',
            entity_id: agency.id,
          });
        } catch {
          // Report generation failed — skip silently
        }
      }
    }

    // Check Tag-14: garantie_start + 14 days
    const tag14Date = new Date(start);
    tag14Date.setDate(tag14Date.getDate() + 14);

    if (toDateString(tag14Date) === todayStr) {
      const { data: existing } = await supabase
        .from('reports')
        .select('id')
        .eq('agency_id', agency.id)
        .eq('typ', 'tag_14')
        .limit(1);

      if (!existing?.length) {
        try {
          const daten = await generateReport(supabase, agency.id, 'tag_14');
          await supabase.from('reports').insert({
            agency_id: agency.id,
            typ: 'tag_14',
            stichtag: todayStr,
            status: 'generiert',
            daten_json: daten,
          });

          await createNotificationForInternals(supabase, {
            title: `Tag-14 Report fuer ${agency.name} bereit zur Freigabe`,
            body: `Der Tag-14 Report wurde automatisch generiert und wartet auf Freigabe.`,
            type: 'system',
            entity_type: 'agency',
            entity_id: agency.id,
          });
        } catch {
          // Report generation failed — skip silently
        }
      }
    }
  }
}
