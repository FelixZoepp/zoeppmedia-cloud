/**
 * Freigaben: neue Automatiken sind AUS, bis Felix sie unter /admin/freigaben einschaltet.
 * Regel: Keine Automatik schickt Nachrichten an Kunden, Leads oder Bewerber.
 * Gespeichert in system_einstellungen.automatik_freigaben = {"<key>": true}.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const FREIGABEN = {
  speed_alarm: {
    titel: '🚨 Speed-to-Lead-Alarm',
    was: 'Neue Eintragung ohne Termin und 30 Minuten nach der Eintragung noch kein Anruf in Close → Push + Slack #03-sales und WhatsApp an dich (Nummer aus dem CEO-Briefing). Nachts erst um 8:30 Uhr.',
    wirkt: 'Nur intern an dich und das Team (keine Nachricht an Leads)',
  },
  protokoll_aufgaben: {
    titel: '📝 Protokoll-Pflicht',
    was: 'Ein Gespräch über 60 Sekunden ohne Gesprächsprotokoll innerhalb von 20 Minuten → der Mitarbeiter bekommt in Close die Aufgabe „Protokoll fehlt“.',
    wirkt: 'Close-Aufgaben für das Team (keine Nachricht an Leads)',
  },
  termin_check: {
    titel: '📅 Termin nicht in Calendly',
    was: 'Ein Setting, Closing oder CC2 wird nur im Gesprächsprotokoll gelegt und steht 15 Minuten später nicht in Calendly → Hinweis ans Team (Push + Slack): bitte über Calendly einbuchen, sonst bekommt der Lead keine Bestätigung und keine Erinnerung.',
    wirkt: 'Nur intern (keine Nachricht an Leads)',
  },
  verlustgrund_aufgabe: {
    titel: '❓ Verlustgrund-Pflicht',
    was: 'Eine Opportunity geht in Close auf „verloren“ und 30 Minuten später ist kein Verlustgrund eingetragen → der Verantwortliche bekommt in Close die Aufgabe „Verlustgrund eintragen“.',
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
  noshow_rueckfrage: {
    titel: '👻 No-Show-Rückfrage (Setting + Closing)',
    was:
      'Du setzt in Close „Setting - No Show“ oder „Closing - No Show“ → WhatsApp „Wann kann ich dich besser erreichen?“ mit Fallstudie (Setting: B&C/Damian, Closing: David Hamid, dort zusätzlich: wer entscheidet mit). ' +
      'Antwortet der Lead, liest die KI Tag/Uhrzeit aus → Aufgabe in Close + Slack #03-sales. Die Vorlagen müssen vorher bei Meta freigegeben sein. Aus: Setting bleibt bei der alten Vorlage noshow_1_anruf, Closing schickt nichts (nur Hinweis an dich).',
    wirkt: 'WhatsApp an den Lead – einmal je Opportunity, ausgelöst durch deinen Status-Wechsel in Close',
  },
  empfehlung_aufgaben: {
    titel: '🌟 Empfehlungen anfragen',
    was: 'Kunden mit Zufriedenheit ≥ 8/10 und guten Ergebnissen erscheinen unter Kunden → Empfehlungen. Eingeschaltet bekommt der Kundenbetreuer zusätzlich eine Aufgabe „Empfehlung/Video anfragen“ (Anruf, keine automatische Nachricht).',
    wirkt: 'Aufgaben in der Cloud für das Team',
  },
  telefonie: {
    titel: '📞 Telefonieren über die Cloud',
    was:
      'Im Anruf-Modus rufen Team und Kunden direkt im Browser an. Absender ist die Nummer aus der Anruf-Einrichtung des Kunden. ' +
      'Mit Aufnahme hört der Angerufene beim Abheben zuerst „Dieses Gespräch wird zur Qualitätssicherung aufgezeichnet“. Die Aufnahme wird transkribiert und ausgewertet und danach bei Twilio gelöscht. ' +
      'Aus: nur Admins können zum Testen telefonieren.',
    wirkt: 'Nur Anrufe, die jemand selbst startet – nichts läuft automatisch',
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
