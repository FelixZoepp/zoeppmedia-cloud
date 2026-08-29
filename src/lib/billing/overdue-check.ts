import { SupabaseClient } from '@supabase/supabase-js';
import { createNotificationForInternals } from '@/lib/notifications/create';

/**
 * Check for overdue/failed billing runs and create internal tasks.
 * Called from the daily cron.
 *
 * Rules:
 * - Fehlgeschlagen → sofort Aufgabe "Zahlung fehlgeschlagen — prüfen"
 * - 7 Tage nach Rechnung ohne Zahlung → Aufgabe "Zahlungserinnerung senden"
 * - 14 Tage → Aufgabe "Mahnung in Lexware erstellen und versenden"
 * - 30 Tage → Aufgabe "Eskalation: Kunde kontaktieren wegen offener Zahlung"
 */
export async function checkOverdueBillingRuns(supabase: SupabaseClient): Promise<number> {
  const now = new Date();
  let tasksCreated = 0;

  // 1. Fehlgeschlagene Zahlungen → sofort Aufgabe
  const { data: failed } = await supabase
    .from('billing_runs')
    .select('id, agency_id, lex_invoice_number, betrag_brutto, fehlergrund, agencies:agency_id(name)')
    .eq('status', 'fehlgeschlagen');

  for (const run of failed ?? []) {
    const agencyName = ((run.agencies as unknown as { name: string } | null))?.name ?? 'Unbekannt';

    // Check if task already exists for this run
    const { data: existing } = await supabase
      .from('internal_tasks')
      .select('id')
      .eq('title', `Zahlung fehlgeschlagen: ${run.lex_invoice_number || run.id}`)
      .limit(1);

    if (existing && existing.length > 0) continue;

    await supabase.from('internal_tasks').insert({
      title: `Zahlung fehlgeschlagen: ${run.lex_invoice_number || run.id}`,
      description: `${agencyName} — €${Number(run.betrag_brutto).toFixed(2)}\nFehler: ${run.fehlergrund || 'Unbekannt'}\n\nOptionen:\n1. Erneut versuchen (Stripe)\n2. Kunde kontaktieren\n3. Mahnung in Lexware erstellen`,
      agency_id: run.agency_id,
      status: 'todo',
      priority: 'urgent',
    });

    await createNotificationForInternals(supabase, {
      title: `Zahlung fehlgeschlagen: ${agencyName}`,
      body: `${run.lex_invoice_number} — €${Number(run.betrag_brutto).toFixed(2)}`,
      type: 'system',
      entity_type: 'agency',
      entity_id: run.agency_id,
    });

    tasksCreated++;
  }

  // 2. Überfällige Rechnungen (rechnung_erstellt oder zahlung_angestossen, älter als X Tage)
  const { data: openRuns } = await supabase
    .from('billing_runs')
    .select('id, agency_id, lex_invoice_number, betrag_brutto, erstellt_am, agencies:agency_id(name)')
    .in('status', ['rechnung_erstellt', 'zahlung_angestossen', 'vorab_benachrichtigt']);

  for (const run of openRuns ?? []) {
    const agencyName = ((run.agencies as unknown as { name: string } | null))?.name ?? 'Unbekannt';
    const daysSince = Math.floor((now.getTime() - new Date(run.erstellt_am).getTime()) / 86400000);

    // Determine escalation level
    let taskTitle: string | null = null;
    let taskPriority: string = 'medium';

    if (daysSince >= 30) {
      taskTitle = `Eskalation 30 Tage: ${run.lex_invoice_number || run.id} — ${agencyName}`;
      taskPriority = 'urgent';
    } else if (daysSince >= 14) {
      taskTitle = `Mahnung in Lexware erstellen: ${run.lex_invoice_number || run.id} — ${agencyName}`;
      taskPriority = 'high';
    } else if (daysSince >= 7) {
      taskTitle = `Zahlungserinnerung senden: ${run.lex_invoice_number || run.id} — ${agencyName}`;
      taskPriority = 'medium';
    }

    if (!taskTitle) continue;

    // Check if task already exists
    const { data: existing } = await supabase
      .from('internal_tasks')
      .select('id')
      .eq('title', taskTitle)
      .limit(1);

    if (existing && existing.length > 0) continue;

    await supabase.from('internal_tasks').insert({
      title: taskTitle,
      description: `${agencyName} — €${Number(run.betrag_brutto).toFixed(2)}\nRechnung: ${run.lex_invoice_number || 'ohne Nummer'}\nErstellt: ${new Date(run.erstellt_am).toLocaleDateString('de-DE')}\nÜberfällig seit: ${daysSince} Tagen\n\n${daysSince >= 14 ? 'Bitte Mahnung in Lexware Office erstellen und versenden.' : 'Bitte Zahlungserinnerung per Mail senden.'}`,
      agency_id: run.agency_id,
      status: 'todo',
      priority: taskPriority,
    });

    tasksCreated++;
  }

  return tasksCreated;
}
