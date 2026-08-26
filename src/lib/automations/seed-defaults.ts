import { SupabaseClient } from '@supabase/supabase-js';

interface DefaultAutomation {
  name: string;
  trigger_event: string;
  conditions: unknown[];
  actions: unknown[];
}

const DEFAULT_AUTOMATIONS: DefaultAutomation[] = [
  {
    name: 'Neuer Bewerber → Benachrichtigung',
    trigger_event: 'candidate_created',
    conditions: [],
    actions: [
      {
        type: 'send_notification',
        params: {
          title: 'Neuer Bewerber: {{candidate.name}}',
          type: 'new_candidate',
          user_scope: 'agency',
        },
      },
    ],
  },
  {
    name: 'Phase geändert → Benachrichtigung',
    trigger_event: 'stage_changed',
    conditions: [],
    actions: [
      {
        type: 'send_notification',
        params: {
          title: '{{candidate.name}} → {{data.new_stage_name}}',
          type: 'stage_change',
          user_scope: 'agency',
        },
      },
    ],
  },
  {
    name: 'No-Show → Benachrichtigung',
    trigger_event: 'noshow_recorded',
    conditions: [],
    actions: [
      {
        type: 'send_notification',
        params: {
          title: 'No-Show: {{candidate.name}}',
          type: 'noshow',
          user_scope: 'agency',
        },
      },
    ],
  },
  {
    name: 'Opt-Out → Benachrichtigung',
    trigger_event: 'opt_out',
    conditions: [],
    actions: [
      {
        type: 'send_notification',
        params: {
          title: 'Opt-Out: {{candidate.name}}',
          type: 'opt_out',
          user_scope: 'internals',
        },
      },
    ],
  },
];

export async function seedDefaultAutomations(supabase: SupabaseClient): Promise<number> {
  let seeded = 0;

  for (const def of DEFAULT_AUTOMATIONS) {
    // Check if this system automation already exists by name + trigger
    const { data: existing } = await supabase
      .from('automations')
      .select('id')
      .eq('name', def.name)
      .eq('trigger_event', def.trigger_event)
      .eq('is_system', true)
      .is('agency_id', null)
      .limit(1);

    if (existing && existing.length > 0) {
      // Update existing system automation
      await supabase
        .from('automations')
        .update({
          conditions: def.conditions,
          actions: def.actions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing[0].id);
    } else {
      // Insert new system automation
      await supabase.from('automations').insert({
        agency_id: null,
        name: def.name,
        trigger_event: def.trigger_event,
        conditions: def.conditions,
        actions: def.actions,
        delay_seconds: 0,
        active: true,
        is_system: true,
        created_by: null,
      });
      seeded++;
    }
  }

  return seeded;
}
