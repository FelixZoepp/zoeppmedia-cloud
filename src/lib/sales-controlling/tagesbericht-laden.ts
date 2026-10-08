/** Tagesbericht laden (Close + sales_eintragungen) – für die Seite und den Abendbericht */
import { createAdminClient } from '@/lib/supabase/admin';
import { berlinMitternacht } from '@/lib/zeit/berlin';
import { ladeAnrufe, ladeClose, ladeProtokolle } from './quellen';
import { berechneTagesbericht, PROTOKOLL_TYPEN } from './tagesbericht';

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

export async function ladeTagesbericht(tage: string[]) {
  const ältester = [...tage].sort()[0];
  const ab = mitternacht(ältester).toISOString();
  // Statuswechsel weiter zurück, damit der Ausgangsstatus jedes Deals bekannt ist
  const historieAb = mitternacht(ältester, -200).toISOString();
  const [close, anrufe, protokolle, eintragungen] = await Promise.all([
    ladeClose(historieAb, () => []),
    ladeAnrufe(ab),
    ladeProtokolle(ab, Object.values(PROTOKOLL_TYPEN)).catch((err) => (console.error('[tagesbericht] Protokolle', err), null)),
    createAdminClient().from('sales_eintragungen').select('eingetragen_am, ergebnis').gte('eingetragen_am', ab),
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
