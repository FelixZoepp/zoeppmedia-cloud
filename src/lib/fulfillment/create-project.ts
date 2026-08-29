import { SupabaseClient } from '@supabase/supabase-js';

interface TaskTemplate {
  id: string;
  titel: string;
  prozess: string | null;
  beschreibung: string | null;
  owner_funktion: string | null;
  ausloeser: string;
  sla_tage: number | null;
  reihenfolge: number | null;
  abhaengig_von: string[] | null;
  checkliste: string[] | null;
  benoetigte_zugaenge: string[] | null;
  vorlagen_links: string[] | null;
  definition_of_done: string | null;
  abgabe_typ: string | null;
  freigabe_noetig: boolean;
  aktiv: boolean;
}

interface AccessItemTemplate {
  id: string;
  produkt: string;
  typ: string;
  label: string;
  pflicht: boolean;
  hinweis_fuer_kunden: string | null;
  anleitung_url: string | null;
  verantwortlich: string | null;
  reihenfolge: number | null;
}

/**
 * Creates the full project scaffold for a new client after a deal is closed.
 *
 * 1. Inserts access_items from matching access_item_templates
 * 2. Inserts project_tasks from active task_templates with ausloeser='after_close'
 * 3. Copies checkliste into project_task_checkitems
 * 4. Resolves owner_funktion to a user_id
 * 5. Maps template abhaengig_von to created task IDs for blockiert_durch
 */
export async function createProjectFromClose(
  supabase: SupabaseClient,
  agencyId: string,
  produkt: string
): Promise<{ tasks_created: number; access_items_created: number }> {
  // --- 1. Access Items ---
  const { data: accessTemplates } = await supabase
    .from('access_item_templates')
    .select('*')
    .eq('produkt', produkt)
    .order('reihenfolge', { ascending: true });

  let accessItemsCreated = 0;

  if (accessTemplates && accessTemplates.length > 0) {
    const accessRows = (accessTemplates as AccessItemTemplate[]).map((t) => ({
      agency_id: agencyId,
      typ: t.typ,
      label: t.label,
      pflicht: t.pflicht,
      status: 'offen',
      hinweis_fuer_kunden: t.hinweis_fuer_kunden,
      anleitung_url: t.anleitung_url,
      verantwortlich: t.verantwortlich,
    }));

    const { data: inserted } = await supabase
      .from('access_items')
      .insert(accessRows)
      .select('id');

    accessItemsCreated = inserted?.length ?? 0;
  }

  // --- 2. Task Templates ---
  const { data: templates } = await supabase
    .from('task_templates')
    .select('*')
    .eq('ausloeser', 'after_close')
    .eq('aktiv', true)
    .order('reihenfolge', { ascending: true });

  if (!templates || templates.length === 0) {
    return { tasks_created: 0, access_items_created: accessItemsCreated };
  }

  const typedTemplates = templates as TaskTemplate[];

  // --- 3. Resolve owner_funktion -> user_id ---
  const funktionen = [
    ...new Set(
      typedTemplates
        .map((t) => t.owner_funktion)
        .filter((f): f is string => f !== null)
    ),
  ];

  const funktionToUserId: Record<string, string> = {};

  if (funktionen.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, funktion')
      .in('funktion', funktionen)
      .in('role', ['admin', 'employee']);

    if (users) {
      for (const u of users) {
        // First match per funktion wins
        if (u.funktion && !funktionToUserId[u.funktion]) {
          funktionToUserId[u.funktion] = u.id;
        }
      }
    }
  }

  // --- 4. Create tasks, mapping template IDs to created task IDs ---
  const templateIdToTaskId: Record<string, string> = {};
  let tasksCreated = 0;

  for (const template of typedTemplates) {
    const now = new Date();
    const faelligAm = template.sla_tage
      ? new Date(now.getTime() + template.sla_tage * 86400000).toISOString().slice(0, 10)
      : null;

    // Resolve dependencies: map template abhaengig_von IDs to already-created task IDs
    let blockiertDurch: string[] | null = null;
    let status = 'offen';

    if (template.abhaengig_von && template.abhaengig_von.length > 0) {
      blockiertDurch = template.abhaengig_von
        .map((depTemplateId) => templateIdToTaskId[depTemplateId])
        .filter(Boolean);

      if (blockiertDurch.length > 0) {
        status = 'blockiert';
      }
    }

    const ownerId = template.owner_funktion
      ? funktionToUserId[template.owner_funktion] ?? null
      : null;

    const { data: task } = await supabase
      .from('project_tasks')
      .insert({
        agency_id: agencyId,
        template_id: template.id,
        titel: template.titel,
        beschreibung: template.beschreibung,
        owner_user_id: ownerId,
        owner_funktion: template.owner_funktion,
        status,
        faellig_am: faelligAm,
        blockiert_durch: blockiertDurch,
        freigabe_noetig: template.freigabe_noetig,
        reihenfolge: template.reihenfolge,
      })
      .select('id')
      .single();

    if (task) {
      templateIdToTaskId[template.id] = task.id;
      tasksCreated++;

      // --- 5. Copy checkliste into project_task_checkitems ---
      if (template.checkliste && template.checkliste.length > 0) {
        const checkItems = template.checkliste.map((text, idx) => ({
          task_id: task.id,
          text,
          reihenfolge: idx + 1,
          erledigt: false,
        }));

        await supabase.from('project_task_checkitems').insert(checkItems);
      }
    }
  }

  return { tasks_created: tasksCreated, access_items_created: accessItemsCreated };
}
