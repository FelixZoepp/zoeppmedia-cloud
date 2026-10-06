import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';

/** Support-Anfragen der Kunden: Fragen, Probleme, Wünsche und Upsell-Interesse aus den Empfehlungen. */

export type AnfrageArt = 'frage' | 'problem' | 'wunsch' | 'interesse';
export type AnfrageStatus = 'offen' | 'in_bearbeitung' | 'erledigt';

export const ANFRAGE_ARTEN: readonly AnfrageArt[] = ['frage', 'problem', 'wunsch', 'interesse'];
export const ANFRAGE_STATUS: readonly AnfrageStatus[] = ['offen', 'in_bearbeitung', 'erledigt'];

export const ART_LABEL: Record<AnfrageArt, string> = {
  frage: 'Frage',
  problem: 'Problem',
  wunsch: 'Wunsch',
  interesse: 'Upsell-Interesse',
};

export interface Anfrage {
  id: string;
  agency_id: string;
  user_id: string | null;
  art: AnfrageArt;
  thema: string;
  nachricht: string | null;
  empfehlung_id: string | null;
  status: AnfrageStatus;
  antwort: string | null;
  bearbeitet_von: string | null;
  created_at: string;
  updated_at: string;
}

/** Eingaben prüfen – liefert eine deutsche Fehlermeldung oder die bereinigten Werte */
export function pruefeAnfrage(body: unknown):
  | { ok: true; art: AnfrageArt; thema: string; nachricht: string | null; empfehlungId: string | null }
  | { ok: false; fehler: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const art = b.art;
  if (typeof art !== 'string' || !ANFRAGE_ARTEN.includes(art as AnfrageArt)) return { ok: false, fehler: 'Bitte eine Art wählen (Frage, Problem oder Wunsch).' };
  const thema = typeof b.thema === 'string' ? b.thema.trim() : '';
  if (thema.length < 3) return { ok: false, fehler: 'Bitte ein Thema angeben (mind. 3 Zeichen).' };
  if (thema.length > 200) return { ok: false, fehler: 'Das Thema ist zu lang (max. 200 Zeichen).' };
  const nachricht = typeof b.nachricht === 'string' && b.nachricht.trim() ? b.nachricht.trim().slice(0, 4000) : null;
  if (art !== 'interesse' && !nachricht) return { ok: false, fehler: 'Bitte beschreibe kurz dein Anliegen.' };
  const empfehlungId = typeof b.empfehlungId === 'string' && b.empfehlungId.trim() ? b.empfehlungId.trim().slice(0, 80) : null;
  return { ok: true, art: art as AnfrageArt, thema, nachricht, empfehlungId };
}

/** Anfrage anlegen und den Ansprechpartner (sonst alle Admins) benachrichtigen. */
export async function erstelleAnfrage(
  svc: SupabaseClient,
  input: {
    agencyId: string;
    userId: string | null;
    art: 'frage' | 'problem' | 'wunsch' | 'interesse';
    thema: string;
    nachricht?: string | null;
    empfehlungId?: string | null;
  },
): Promise<{ id: string }> {
  const { data, error } = await svc
    .from('support_anfragen')
    .insert({
      agency_id: input.agencyId,
      user_id: input.userId,
      art: input.art,
      thema: input.thema,
      nachricht: input.nachricht ?? null,
      empfehlung_id: input.empfehlungId ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Anfrage konnte nicht gespeichert werden: ${error?.message ?? 'unbekannt'}`);
  const id = (data as { id: string }).id;

  const { data: ag } = await svc.from('agencies').select('name, csm_user_id').eq('id', input.agencyId).maybeSingle();
  const agentur = ag as { name: string; csm_user_id: string | null } | null;
  const kunde = agentur?.name ?? 'Kunde';

  let empfaenger: string[] = agentur?.csm_user_id ? [agentur.csm_user_id] : [];
  if (!empfaenger.length) {
    const { data: admins } = await svc.from('users').select('id').eq('role', 'admin');
    empfaenger = ((admins ?? []) as Array<{ id: string }>).map((a) => a.id);
  }

  const titel = input.art === 'interesse' ? `Upsell-Interesse: ${input.thema} – ${kunde}` : `Neue Anfrage von ${kunde}`;
  const text = input.art === 'interesse' ? (input.nachricht ?? 'Kunde möchte mehr erfahren.') : `${ART_LABEL[input.art]}: ${input.thema}`;
  for (const userId of empfaenger) {
    await createNotification(svc, {
      user_id: userId,
      agency_id: input.agencyId,
      title: titel.slice(0, 200),
      body: text.slice(0, 300),
      type: 'system',
      entity_type: 'agency',
      entity_id: input.agencyId,
      push_url: '/admin/support',
    }).catch(() => {});
  }

  await logActivity(svc, {
    agency_id: input.agencyId,
    user_id: input.userId,
    action: input.art === 'interesse' ? `Interesse gemeldet: ${input.thema}` : `Support-Anfrage (${ART_LABEL[input.art]}): ${input.thema}`,
    action_type: 'other',
    metadata: { kind: 'support_anfrage', anfrage_id: id, art: input.art, empfehlung_id: input.empfehlungId ?? null },
  });

  return { id };
}

export async function ladeAnfragen(svc: SupabaseClient, filter: { agencyId?: string; status?: string } = {}): Promise<Anfrage[]> {
  let q = svc.from('support_anfragen').select('*').order('created_at', { ascending: false }).limit(300);
  if (filter.agencyId) q = q.eq('agency_id', filter.agencyId);
  if (filter.status && ANFRAGE_STATUS.includes(filter.status as AnfrageStatus)) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) throw new Error(`Anfragen konnten nicht geladen werden: ${error.message}`);
  return (data ?? []) as Anfrage[];
}
