import type { SupabaseClient } from '@supabase/supabase-js';
import { ABSAGE_LEER, absageFelder } from './absagegruende';

/**
 * Absagegrund am Bewerber speichern (Phasenwechsel nach „Abgesagt“) bzw. leeren,
 * wenn er wieder in eine andere Phase kommt. Nur DB – keine Nachricht an den Bewerber.
 */
export async function absageAmBewerber(
  db: SupabaseClient,
  args: {
    candidateId: string;
    agencyId: string;
    absage: { code: string; notiz: string | null } | null;
    userId: string | null;
    /** Phase vor der Absage */
    phaseId: string | null;
  },
): Promise<void> {
  const q = db
    .from('candidates')
    .update(
      args.absage
        ? absageFelder({ code: args.absage.code, notiz: args.absage.notiz, userId: args.userId, phaseId: args.phaseId })
        : { ...ABSAGE_LEER },
    )
    .eq('id', args.candidateId)
    .eq('agency_id', args.agencyId);
  const { error } = args.absage ? await q : await q.not('abgesagt_am', 'is', null);
  if (error) console.error('Absagegrund speichern fehlgeschlagen', error.message);
}
