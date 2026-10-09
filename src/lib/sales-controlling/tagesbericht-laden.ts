/** Tagesbericht laden (Close + sales_eintragungen) – für die Seite und den Abendbericht */
import { createAdminClient } from '@/lib/supabase/admin';
import { berlinMitternacht } from '@/lib/zeit/berlin';
import { ladeAnrufe, ladeClose } from './quellen';
import type { SupabaseClient } from '@supabase/supabase-js';
import { berechneTagesbericht, PROTOKOLL_TYPEN, type Protokoll } from './tagesbericht';

const TAG = 864e5;

/** Kalendertage von–bis (YYYY-MM-DD, beide inklusive), neueste zuerst */
export function tageZwischen(von: string, bis: string): string[] {
  const out: string[] = [];
  for (let t = new Date(`${bis}T12:00:00Z`).getTime(); t >= new Date(`${von}T12:00:00Z`).getTime(); t -= TAG) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

const mitternacht = (tag: string, deltaTage = 0) => {
  const [y, m, d] = tag.split('-').map(Number);
  return berlinMitternacht(y, m, d + deltaTage);
};

const TYP_ID: Record<string, string> = {
  terminierung: PROTOKOLL_TYPEN.coldCall,
  setting: PROTOKOLL_TYPEN.setting,
  closing: PROTOKOLL_TYPEN.closing,
  follow_up: PROTOKOLL_TYPEN.followUp,
};

/** Gesprächsprotokolle aus der Cloud (kommen per Close-Webhook in close_protokolle) */
async function ladeProtokolleAusCloud(svc: SupabaseClient, ab: string): Promise<Protokoll[] | null> {
  const { data, error } = await svc.from('close_protokolle').select('typ, lead_id, user_id, datum, felder').gte('datum', ab).limit(20000);
  if (error) {
    console.error('[tagesbericht] Protokolle', error.message);
    return null;
  }
  return ((data ?? []) as Array<{ typ: string; lead_id: string | null; user_id: string | null; datum: string; felder: Record<string, string | null> }>).map((p) => ({
    typ: TYP_ID[p.typ] ?? p.typ,
    lead_id: p.lead_id,
    user_id: p.user_id,
    date: p.datum,
    felder: p.felder ?? {},
  }));
}

export async function ladeTagesbericht(tage: string[]) {
  const svc = createAdminClient();
  const ältester = [...tage].sort()[0];
  const ab = mitternacht(ältester).toISOString();
  // Statuswechsel weiter zurück, damit der Ausgangsstatus jedes Deals bekannt ist
  const historieAb = mitternacht(ältester, -200).toISOString();
  const [close, anrufe, protokolle, eintragungen] = await Promise.all([
    ladeClose(historieAb, () => []),
    ladeAnrufe(ab),
    ladeProtokolleAusCloud(svc, ab),
    svc.from('sales_eintragungen').select('eingetragen_am, ergebnis').gte('eingetragen_am', ab),
  ]);
  return {
    ...berechneTagesbericht({
      tage,
      statuses: close.statuses,
      opps: close.opps,
      events: close.events,
      anrufe,
      protokolle: protokolle ?? [],
      eintragungen: (eintragungen.data ?? []) as Array<{ eingetragen_am: string; ergebnis: string }>,
      users: close.users,
    }),
    protokolleVerbunden: protokolle !== null,
  };
}
