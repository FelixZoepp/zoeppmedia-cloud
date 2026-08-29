import { SupabaseClient } from '@supabase/supabase-js';

interface TemplateStage {
  key: string;
  name: string;
  reihenfolge: number;
  sla_stunden?: number | null;
  sla_minuten?: number | null;
  owner_rolle?: string;
  gate_bedingung?: string | null;
  assets?: Array<{
    typ: string;
    titel: string;
  }>;
}

interface TemplateDefinition {
  stufen: TemplateStage[];
  [key: string]: unknown;
}

/**
 * Instantiates a recruiting pipeline for an agency from a template.
 *
 * 1. Finds the active template (latest version of the given key)
 * 2. Creates a recruiting_pipelines record
 * 3. Creates recruiting_stages from the template's stufen array
 * 4. Creates placeholder stage_assets for each stage that has assets defined
 * 5. Pipeline starts as aktiv: false -- goes active when pflicht assets are filled
 */
export async function instantiatePipeline(
  supabase: SupabaseClient,
  agencyId: string,
  templateKey: string = 'd2d_recruiting'
) {
  // 1. Find the active template (latest version)
  const { data: template, error: templateError } = await supabase
    .from('recruiting_pipeline_templates')
    .select('*')
    .eq('key', templateKey)
    .eq('aktiv', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (templateError || !template) {
    throw new Error(
      `Template "${templateKey}" nicht gefunden: ${templateError?.message ?? 'Kein aktives Template'}`
    );
  }

  const definition = template.definition_json as TemplateDefinition;

  // Check if pipeline already exists for this agency
  const { data: existing } = await supabase
    .from('recruiting_pipelines')
    .select('id')
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (existing) {
    throw new Error(
      `Agentur hat bereits eine Pipeline (ID: ${existing.id}). Bitte zuerst löschen.`
    );
  }

  // 2. Create pipeline record
  const { data: pipeline, error: pipelineError } = await supabase
    .from('recruiting_pipelines')
    .insert({
      agency_id: agencyId,
      template_id: template.id,
      template_version: template.version,
      aktiv: false,
    })
    .select()
    .single();

  if (pipelineError || !pipeline) {
    throw new Error(
      `Pipeline konnte nicht erstellt werden: ${pipelineError?.message ?? 'Unbekannter Fehler'}`
    );
  }

  // 3. Create stages from template
  const stages = definition.stufen.map((stufe) => ({
    pipeline_id: pipeline.id,
    key: stufe.key,
    name: stufe.name,
    reihenfolge: stufe.reihenfolge,
    sla_stunden: stufe.sla_stunden ?? null,
    sla_minuten: stufe.sla_minuten ?? null,
    owner_rolle: stufe.owner_rolle ?? null,
    gate_bedingung: stufe.gate_bedingung ?? null,
    aktiv: true,
    pflicht: true,
    config_json: {},
  }));

  const { error: stagesError } = await supabase
    .from('recruiting_stages')
    .insert(stages);

  if (stagesError) {
    // Cleanup: delete the pipeline if stages fail
    await supabase.from('recruiting_pipelines').delete().eq('id', pipeline.id);
    throw new Error(`Stufen konnten nicht erstellt werden: ${stagesError.message}`);
  }

  // 4. Create placeholder assets for each stage
  const assets: Array<{
    stage_key: string;
    typ: string;
    titel: string;
    agency_id: string;
  }> = [];

  for (const stufe of definition.stufen) {
    if (stufe.assets && stufe.assets.length > 0) {
      for (const asset of stufe.assets) {
        assets.push({
          stage_key: stufe.key,
          typ: asset.typ,
          titel: asset.titel,
          agency_id: agencyId,
        });
      }
    }
  }

  if (assets.length > 0) {
    const { error: assetsError } = await supabase
      .from('stage_assets')
      .insert(assets);

    if (assetsError) {
      // Non-fatal: log but don't fail
      console.error(`Assets konnten nicht erstellt werden: ${assetsError.message}`);
    }
  }

  return {
    pipeline,
    stagesCount: stages.length,
    assetsCount: assets.length,
  };
}
