/**
 * Freigaben: neue Automatiken sind AUS, bis Felix sie unter /admin/freigaben einschaltet.
 * Regel: Keine Automatik schickt Nachrichten an Kunden, Leads oder Bewerber.
 * Gespeichert in system_einstellungen.automatik_freigaben = {"<key>": true}.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const FREIGABEN = {
  protokoll_aufgaben: {
    titel: '📝 Protokoll-Pflicht',
    was: 'Ein Gespräch über 60 Sekunden ohne Gesprächsprotokoll innerhalb von 20 Minuten → der Mitarbeiter bekommt in Close die Aufgabe „Protokoll fehlt“.',
    wirkt: 'Close-Aufgaben für das Team (keine Nachricht an Leads)',
  },
  closing_ergebnisse: {
    titel: '🤝 Closing-Ergebnisse umsetzen',
    was:
      'Closing-Protokoll „Nächster Schritt“ → Close: Angebot versendet → „Angebot verschickt“ · CC2 vereinbart → „CC2 – Terminiert“ · No-Show → „Closing – No Show“ · ' +
      'Verschoben → „Closing – Terminiert“ (gesperrt bis Kalender) · Verloren → Opportunity verloren · Unqualifiziert → Lead „Unqualifiziert“ (3 Monate gesperrt) · Disqualifiziert → Lead „Disqualifiziert“.',
    wirkt: 'Status in Close (keine Nachricht an Leads). Achtung: eigene Close-Workflows auf diese Status würden mitlaufen.',
  },
  angebot_nachfassen: {
    titel: '📨 Angebote nachfassen',
    was: 'Nach „Angebot versendet“ bekommt der Closer in Close Aufgaben zum Nachfassen an Tag 1, 3 und 7. Kein automatischer Versand an den Lead – der Closer ruft an.',
    wirkt: 'Close-Aufgaben für den Closer',
  },
  empfehlung_aufgaben: {
    titel: '🌟 Empfehlungen anfragen',
    was: 'Kunden mit Zufriedenheit ≥ 8/10 und guten Ergebnissen erscheinen unter Kunden → Empfehlungen. Eingeschaltet bekommt der Kundenbetreuer zusätzlich eine Aufgabe „Empfehlung/Video anfragen“ (Anruf, keine automatische Nachricht).',
    wirkt: 'Aufgaben in der Cloud für das Team',
  },
} as const;

export type FreigabeKey = keyof typeof FREIGABEN;

export async function ladeFreigaben(svc: SupabaseClient): Promise<Record<FreigabeKey, boolean>> {
  const leer = Object.fromEntries(Object.keys(FREIGABEN).map((k) => [k, false])) as Record<FreigabeKey, boolean>;
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', 'automatik_freigaben').maybeSingle();
  try {
    const w = (data as { wert: unknown } | null)?.wert;
    const obj = (typeof w === 'string' ? JSON.parse(w) : w) as Record<string, unknown> | null;
    for (const k of Object.keys(leer) as FreigabeKey[]) leer[k] = obj?.[k] === true;
  } catch {
    /* alles aus */
  }
  return leer;
}

export async function istFreigegeben(svc: SupabaseClient, key: FreigabeKey): Promise<boolean> {
  return (await ladeFreigaben(svc))[key];
}

export async function setzeFreigabe(svc: SupabaseClient, key: FreigabeKey, an: boolean): Promise<void> {
  const aktuell = await ladeFreigaben(svc);
  aktuell[key] = an;
  const { error } = await svc.from('system_einstellungen').upsert({ key: 'automatik_freigaben', wert: JSON.stringify(aktuell), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}
