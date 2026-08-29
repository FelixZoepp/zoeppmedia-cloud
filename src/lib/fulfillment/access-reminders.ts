import { SupabaseClient } from '@supabase/supabase-js';
import { createNotificationForAgency, createNotificationForInternals } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';

interface AccessItem {
  id: string;
  agency_id: string;
  label: string;
  pflicht: boolean;
  status: string;
  angefragt_am: string | null;
  erinnert_am: string[] | null;
  created_at: string;
}

interface Agency {
  id: string;
  name: string;
  email: string;
  contact_name: string;
  status: string;
  garantie_start: string | null;
  garantie_ende: string | null;
  laufzeit_monate: number | null;
}

function daysSince(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const then = new Date(dateStr);
  then.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - then.getTime()) / 86400000);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function alreadyRemindedToday(erinnertAm: string[] | null): boolean {
  if (!erinnertAm || erinnertAm.length === 0) return false;
  const today = todayStr();
  return erinnertAm.some((ts) => ts.startsWith(today));
}

/**
 * Check all onboarding agencies for access item reminders.
 *
 * Escalation schedule (days since item created/angefragt):
 *  - Day 0: Set status 'angefragt', send email + notification
 *  - Day 1: First reminder (only open items)
 *  - Day 3: Second reminder + "dies verzögert deinen Starttermin"
 *  - Day 5: Internal task for ops — "Kunden anrufen wegen Zugänge"
 *  - Day 7: Internal task for admin — "Startdatum schriftlich verschieben"
 *
 * When ALL pflicht access_items are 'erfuellt':
 *  - Set garantie_start to today, garantie_ende to today + laufzeit_monate
 *  - Unblock project_tasks blocked by access items
 *  - Send notification + log activity
 */
export async function checkAccessReminders(supabase: SupabaseClient) {
  // 1. Get all onboarding agencies
  const { data: agencies } = await supabase
    .from('agencies')
    .select('id, name, email, contact_name, status, garantie_start, garantie_ende, laufzeit_monate')
    .eq('status', 'onboarding');

  if (!agencies || agencies.length === 0) return;

  for (const agency of agencies as Agency[]) {
    // 2. Get all access items for this agency
    const { data: items } = await supabase
      .from('access_items')
      .select('*')
      .eq('agency_id', agency.id);

    if (!items || items.length === 0) continue;

    const typedItems = items as AccessItem[];
    const pflichtItems = typedItems.filter((i) => i.pflicht);
    const openItems = typedItems.filter(
      (i) => i.status === 'offen' || i.status === 'angefragt'
    );
    const openPflichtItems = pflichtItems.filter(
      (i) => i.status === 'offen' || i.status === 'angefragt'
    );

    // 3. Check if all pflicht items are fulfilled
    const allPflichtFulfilled = pflichtItems.length > 0 &&
      pflichtItems.every((i) => i.status === 'erfuellt' || i.status === 'nicht_noetig');

    if (allPflichtFulfilled) {
      await handleAllAccessFulfilled(supabase, agency);
      continue;
    }

    // 4. Process each open item for reminders
    for (const item of openItems) {
      if (alreadyRemindedToday(item.erinnert_am)) continue;

      const referenceDate = item.angefragt_am || item.created_at;
      const days = daysSince(referenceDate);

      if (item.status === 'offen' && days >= 0) {
        // Day 0: Set to angefragt and notify
        await supabase
          .from('access_items')
          .update({
            status: 'angefragt',
            angefragt_am: new Date().toISOString(),
            erinnert_am: [new Date().toISOString()],
          })
          .eq('id', item.id);

        await createNotificationForAgency(supabase, agency.id, {
          title: 'Zugang benötigt',
          body: `Bitte stelle den Zugang "${item.label}" bereit.`,
          type: 'task_assigned',
          entity_type: 'agency',
          entity_id: item.id,
        });

        continue;
      }

      // For 'angefragt' items, check escalation
      if (item.status === 'angefragt') {
        const daysSinceAngefragt = daysSince(item.angefragt_am || item.created_at);

        if (daysSinceAngefragt >= 7) {
          // Day 7: Admin escalation — create internal task
          await appendReminder(supabase, item.id, item.erinnert_am);

          await createInternalTask(supabase, agency.id, {
            titel: `Startdatum schriftlich verschieben — ${agency.name}`,
            beschreibung: `Der Zugang "${item.label}" ist seit ${daysSinceAngefragt} Tagen ausstehend. Startdatum schriftlich verschieben und Kunden informieren.`,
            owner_funktion: 'admin',
          });

          await createNotificationForInternals(supabase, {
            title: `Eskalation: Startdatum verschieben — ${agency.name}`,
            body: `Zugang "${item.label}" seit ${daysSinceAngefragt} Tagen ausstehend.`,
            type: 'sla_breach',
            entity_type: 'agency',
            entity_id: agency.id,
          });
        } else if (daysSinceAngefragt >= 5) {
          // Day 5: Ops escalation — create internal task
          await appendReminder(supabase, item.id, item.erinnert_am);

          await createInternalTask(supabase, agency.id, {
            titel: `Kunden anrufen wegen Zugänge — ${agency.name}`,
            beschreibung: `Der Zugang "${item.label}" ist seit ${daysSinceAngefragt} Tagen ausstehend. Kunden anrufen und Zugang klären.`,
            owner_funktion: 'ops',
          });

          await createNotificationForInternals(supabase, {
            title: `Eskalation: Kunden anrufen — ${agency.name}`,
            body: `Zugang "${item.label}" seit ${daysSinceAngefragt} Tagen ausstehend.`,
            type: 'task_due',
            entity_type: 'agency',
            entity_id: agency.id,
          });
        } else if (daysSinceAngefragt >= 3) {
          // Day 3: Second reminder with urgency
          await appendReminder(supabase, item.id, item.erinnert_am);

          await createNotificationForAgency(supabase, agency.id, {
            title: 'Erinnerung: Zugang ausstehend',
            body: `Der Zugang "${item.label}" ist noch offen — dies verzögert deinen Starttermin.`,
            type: 'task_due',
            entity_type: 'agency',
            entity_id: item.id,
          });
        } else if (daysSinceAngefragt >= 1) {
          // Day 1: First reminder
          await appendReminder(supabase, item.id, item.erinnert_am);

          await createNotificationForAgency(supabase, agency.id, {
            title: 'Erinnerung: Zugang bereitstellen',
            body: `Bitte stelle den Zugang "${item.label}" bereit, damit wir starten können.`,
            type: 'task_due',
            entity_type: 'agency',
            entity_id: item.id,
          });
        }
      }
    }
  }
}

async function appendReminder(
  supabase: SupabaseClient,
  itemId: string,
  currentReminders: string[] | null
) {
  const updated = [...(currentReminders || []), new Date().toISOString()];
  await supabase
    .from('access_items')
    .update({ erinnert_am: updated })
    .eq('id', itemId);
}

async function createInternalTask(
  supabase: SupabaseClient,
  agencyId: string,
  params: { titel: string; beschreibung: string; owner_funktion: string }
) {
  // Check if a similar task already exists (avoid duplicates)
  const { data: existing } = await supabase
    .from('project_tasks')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('titel', params.titel)
    .neq('status', 'erledigt')
    .neq('status', 'nicht_noetig')
    .maybeSingle();

  if (existing) return; // Task already exists

  // Resolve owner_funktion to user_id
  let ownerUserId: string | null = null;
  const { data: users } = await supabase
    .from('users')
    .select('id, funktion')
    .eq('funktion', params.owner_funktion)
    .in('role', ['admin', 'employee'])
    .limit(1);

  if (users && users.length > 0) {
    ownerUserId = users[0].id;
  }

  await supabase.from('project_tasks').insert({
    agency_id: agencyId,
    titel: params.titel,
    beschreibung: params.beschreibung,
    owner_user_id: ownerUserId,
    owner_funktion: params.owner_funktion,
    status: 'offen',
    freigabe_noetig: false,
    reihenfolge: 0,
    faellig_am: new Date(Date.now() + 86400000).toISOString().slice(0, 10), // tomorrow
  });
}

async function handleAllAccessFulfilled(supabase: SupabaseClient, agency: Agency) {
  const today = todayStr();
  const laufzeit = agency.laufzeit_monate || 3;
  const garantieEnde = new Date(
    new Date(today).getTime() + laufzeit * 30 * 86400000
  ).toISOString().slice(0, 10);

  // Update agency garantie dates
  await supabase
    .from('agencies')
    .update({
      garantie_start: today,
      garantie_ende: garantieEnde,
    })
    .eq('id', agency.id);

  // Unblock project_tasks that reference access items in blockiert_durch
  // Get all access item IDs for this agency
  const { data: accessItems } = await supabase
    .from('access_items')
    .select('id')
    .eq('agency_id', agency.id);

  if (accessItems && accessItems.length > 0) {
    const accessItemIds = accessItems.map((a) => a.id);

    // Find blocked tasks
    const { data: blockedTasks } = await supabase
      .from('project_tasks')
      .select('id, blockiert_durch, status')
      .eq('agency_id', agency.id)
      .eq('status', 'blockiert');

    if (blockedTasks) {
      for (const task of blockedTasks) {
        const blockiertDurch = (task.blockiert_durch as string[]) || [];
        const remaining = blockiertDurch.filter((id) => !accessItemIds.includes(id));

        const taskUpdate: Record<string, unknown> = {
          blockiert_durch: remaining.length > 0 ? remaining : null,
          updated_at: new Date().toISOString(),
        };

        if (remaining.length === 0) {
          taskUpdate.status = 'offen';
        }

        await supabase
          .from('project_tasks')
          .update(taskUpdate)
          .eq('id', task.id);
      }
    }
  }

  // Notify agency
  await createNotificationForAgency(supabase, agency.id, {
    title: 'Alle Zugänge vollständig — Garantie startet!',
    body: `Alle erforderlichen Zugänge sind bereitgestellt. Deine Garantie läuft ab heute für ${laufzeit} Monate.`,
    type: 'system',
    entity_type: 'agency',
    entity_id: agency.id,
  });

  // Log activity
  await logActivity(supabase, {
    agency_id: agency.id,
    action: `Alle Pflicht-Zugänge erfüllt — Garantie startet (${laufzeit} Monate)`,
    action_type: 'onboarding_complete',
    metadata: {
      garantie_start: today,
      garantie_ende: garantieEnde,
      laufzeit_monate: laufzeit,
    },
  });
}
