import type { SupabaseClient } from '@supabase/supabase-js';
import { istFreigegeben } from '@/lib/freigaben';
import { warnAufgaben } from './bewertung';
import { ladeKontrollzentrum } from './laden';

/**
 * Frühwarnung (täglich, nur mit Freigabe „kontrollzentrum_warnungen“): Kunde rot oder Churn-Risiko →
 * interne Aufgabe für den Kundenbetreuer. Je Kunde und Grund höchstens eine offene Aufgabe. Nie Nachricht an Kunden.
 */
export async function planeFruehwarnungen(svc: SupabaseClient, heute: string, jetzt: Date = new Date()): Promise<{ angelegt: number }> {
  if (!(await istFreigegeben(svc, 'kontrollzentrum_warnungen'))) return { angelegt: 0 };

  const [{ zeilen }, { data: offen, error }] = await Promise.all([
    ladeKontrollzentrum(svc, jetzt),
    svc.from('internal_tasks').select('quelle_ref').eq('quelle', 'kontrollzentrum').neq('status', 'done'),
  ]);
  if (error) throw new Error(error.message);
  const refs = ((offen ?? []) as Array<{ quelle_ref: string | null }>).map((x) => x.quelle_ref).filter((x): x is string => !!x);

  let angelegt = 0;
  for (const a of warnAufgaben(zeilen, refs, heute)) {
    const { error: e } = await svc.from('internal_tasks').insert({
      title: a.title,
      description: a.description,
      agency_id: a.agency_id,
      assigned_to: a.assigned_to,
      status: 'todo',
      priority: 'high',
      due_date: heute,
      quelle: 'kontrollzentrum',
      quelle_ref: a.quelle_ref,
    });
    if (!e) angelegt++; // Doppelter quelle_ref (zweiter Lauf am selben Tag) → übersprungen
  }
  return { angelegt };
}
