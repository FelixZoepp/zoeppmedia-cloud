import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications/create';
import { STEP_BY_KEY } from './catalog';

type OffenerSchritt = { owner_user_id: string; agency_id: string; step_key: string; wer: 'kunde' | 'zoepp'; status: string; faellig_am: string };

export interface Erinnerung {
  user_id: string;
  eigene: number;
  kunde: number;
  titel: string;
  text: string;
}

/** Reine Rechnung: je zuständiger Person eine Zusammenfassung der überfälligen Schritte. */
export function baueErinnerungen(schritte: OffenerSchritt[], kunden: Map<string, string>): Erinnerung[] {
  const proPerson = new Map<string, OffenerSchritt[]>();
  for (const s of schritte) proPerson.set(s.owner_user_id, [...(proPerson.get(s.owner_user_id) ?? []), s]);

  return [...proPerson.entries()].map(([user_id, liste]) => {
    // Eigene Arbeit (oder Prüfung) vs. Kunde hängt und muss nachgefasst werden
    const eigene = liste.filter((s) => s.wer === 'zoepp' || s.status === 'zur_pruefung');
    const kunde = liste.filter((s) => s.wer === 'kunde' && s.status !== 'zur_pruefung');
    const älteste = [...liste].sort((a, b) => a.faellig_am.localeCompare(b.faellig_am)).slice(0, 3);
    const teile = [eigene.length && `${eigene.length} bei dir`, kunde.length && `${kunde.length} beim Kunden nachfassen`].filter(Boolean);
    return {
      user_id,
      eigene: eigene.length,
      kunde: kunde.length,
      titel: `${liste.length} Schritt${liste.length === 1 ? '' : 'e'} überfällig`,
      text: `${teile.join(' · ')}: ${älteste
        .map((s) => `${STEP_BY_KEY.get(s.step_key)?.titel ?? s.step_key} (${kunden.get(s.agency_id) ?? 'Kunde'})`)
        .join(', ')}${liste.length > 3 ? ' …' : ''}`,
    };
  });
}

/** Täglich: überfällige Fulfillment-Schritte an die Zuständigen melden (Glocke + Push). */
export async function checkOverdueSteps(svc: SupabaseClient, now: Date = new Date()): Promise<number> {
  const heute = now.toISOString().slice(0, 10);
  const { data } = await svc
    .from('client_steps')
    .select('owner_user_id, agency_id, step_key, wer, status, faellig_am')
    .in('status', ['offen', 'in_arbeit', 'zur_pruefung'])
    .lt('faellig_am', heute)
    .not('owner_user_id', 'is', null);
  const schritte = (data ?? []) as OffenerSchritt[];
  if (!schritte.length) return 0;

  // Pausierte Kunden nicht anmahnen
  const ids = [...new Set(schritte.map((s) => s.agency_id))];
  const { data: ags } = await svc.from('agencies').select('id, name, pausiert_grund').in('id', ids);
  const aktiv = ((ags ?? []) as Array<{ id: string; name: string; pausiert_grund: string | null }>).filter((a) => !a.pausiert_grund);
  const kunden = new Map(aktiv.map((a) => [a.id, a.name]));

  const erinnerungen = baueErinnerungen(
    schritte.filter((s) => kunden.has(s.agency_id)),
    kunden,
  );
  for (const e of erinnerungen) {
    await createNotification(svc, {
      user_id: e.user_id,
      title: e.titel,
      body: e.text.slice(0, 300),
      type: 'task_due',
      push_url: '/meine-todos',
    }).catch((err) => console.error('[step-reminders]', err));
  }
  return erinnerungen.length;
}
