import { SupabaseClient } from '@supabase/supabase-js';
import { generateReport } from './generate-report';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { versendeReport, type ReportTyp } from './versand';
import { istAutomatikKunde } from '@/lib/fulfillment/automatik';

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
          await erzeugeUndVersende(supabase, agency, 'tag_7', todayStr, daten as unknown as Record<string, unknown>);
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
          await erzeugeUndVersende(supabase, agency, 'tag_14', todayStr, daten as unknown as Record<string, unknown>);
        } catch {
          // Report generation failed — skip silently
        }
      }
    }
  }
}

/**
 * Report speichern und sofort an den Kunden schicken. Klappt der Versand nicht
 * (z. B. keine E-Mail hinterlegt), bleibt er „generiert“ und das Team wird informiert.
 * Erzeugt wird nur am Stichtag selbst – alte Reports werden nie nachgeschickt.
 */
async function erzeugeUndVersende(
  supabase: SupabaseClient,
  agency: { id: string; name: string },
  typ: ReportTyp,
  stichtag: string,
  daten: Record<string, unknown>,
) {
  const label = typ === 'tag_7' ? 'Tag-7' : 'Tag-14';
  const { data: report, error } = await supabase
    .from('reports')
    .insert({ agency_id: agency.id, typ, stichtag, status: 'generiert', daten_json: daten })
    .select('id')
    .single();
  if (error || !report) throw error ?? new Error('Report nicht gespeichert');

  // Automatischer Versand nur für Automatik-Kunden (neue Fulfillment-Strecke); sonst wie bisher: Freigabe + Knopf
  if (!(await istAutomatikKunde(supabase, agency.id))) {
    await createNotificationForInternals(supabase, {
      title: `${label} Report fuer ${agency.name} bereit zur Freigabe`,
      body: `Der ${label} Report wurde automatisch generiert und wartet auf Freigabe.`,
      type: 'system',
      entity_type: 'agency',
      entity_id: agency.id,
    });
    return;
  }

  const erg = await versendeReport(supabase, { id: (report as { id: string }).id, agency_id: agency.id, typ, daten_json: daten });
  await createNotificationForInternals(supabase, erg.ok
    ? {
        title: `${label} Report an ${agency.name} verschickt`,
        body: `Automatisch an ${erg.email} gesendet.`,
        type: 'system',
        entity_type: 'agency',
        entity_id: agency.id,
      }
    : {
        title: `${label} Report fuer ${agency.name} nicht verschickt`,
        body: `${erg.error} – bitte im Admin-Bereich pruefen und von Hand senden.`,
        type: 'system',
        entity_type: 'agency',
        entity_id: agency.id,
      });
}
