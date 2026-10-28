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
  abschluss_nachziehen: {
    titel: '🏆 Abschluss nachziehen',
    was:
      'Protokoll „Abgeschlossen“ (Closing oder Follow-up): Gesprächsanalysen des Leads stehen sofort auf „gewonnen“ und die Close-Notiz zeigt „✅ Abgeschlossen“ statt „Abschlusschance … %“. ' +
      'Steht ein Auftragswert in der gewonnenen Opportunity, bekommt der Closer die Aufgabe „Auftragswert prüfen“ (einmalig vs. monatlich). ' +
      'Gibt es den Kunden noch nicht in der Cloud, entsteht die interne Aufgabe „Kunde in der Cloud anlegen“ – bewusst ohne After-Close (keine Vertrags-Mail).',
    wirkt: 'Nur Close-Felder, Close-Aufgaben und interne Aufgaben – keine Nachricht an den Kunden',
  },
  verlustgrund_automatisch: {
    titel: '🏷️ Verlustgrund aus dem Protokoll',
    was:
      'Nennt das Protokoll den Grund (Setting „Unqualifiziert/Disqualifiziert“ + Grund, Follow-up „Verloren“ + Verloren-Grund, Terminierung „Unqualifiziert“ + Einwand Budget/Bedarf/Anbieter), trägt die Cloud ihn in die verlorene Opportunity ein – statt der Aufgabe „Verlustgrund eintragen“. ' +
      'Follow-up „Verloren“ setzt die aktive Opportunity außerdem auf „Verloren“. Ohne eindeutigen Grund (z. B. Closing) bleibt es bei der Aufgabe.',
    wirkt: 'Nur Felder in Close – keine Nachricht an den Lead',
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
  whatsapp_assistent: {
    titel: '🤖 Zoepp-Assistent per WhatsApp',
    was:
      'Du schreibst der Zoepp-Nummer (die das Briefing schickt) eine Frage, z. B. „Wie war die Show-up-Quote diese Woche?“ – der Assistent antwortet in ca. 1 Minute mit Zahlen aus Close, Meta und der Cloud. ' +
      'Nur für die Nummern aus dem CEO-Briefing, alle anderen (Kunden, Leads) laufen normal in den Vertrieb. Nur lesen, nichts ändern. ' +
      'Läuft gerade ein Lead-Test an deine Nummer (24 Std.), geht deine Antwort in den Test – „Assistent: …“ erzwingt den Assistenten. „neu“ beginnt ein neues Gespräch.',
    wirkt: 'WhatsApp-Antworten nur an deine Nummer',
  },
  termin_auto_buchen: {
    titel: '📆 Termine per WhatsApp einbuchen',
    was:
      'Nennt ein Lead auf eine Rückfrage (Eintragung ohne Termin, No-Show, nicht erreicht, Absage) eine Wunschzeit und die ist im Analysegespräch in Calendly frei, fragt die Cloud zurück: „Dann trage ich dich für Montag (19.10.) um 10:00 Uhr ein. Passt das?“ ' +
      'Ist sie belegt, schlägt sie zwei freie Zeiten vor. Nach „Ja“ prüft sie nochmal und bucht über Calendly ein (Name, E-Mail, Telefon, Pflichtfragen aus dem Funnel, Rest neutral + Hinweis in der Notiz) – Calendly schickt die Bestätigung, die normale Termin-Kette läuft. ' +
      'Klappt es nicht: Close-Aufgabe „bitte einbuchen“. Beratungsgespräche bucht weiter ein Mensch. Aus: nur an Testnummern.',
    wirkt: 'WhatsApp-Antworten an den Lead + Calendly-Buchung',
  },
  meta_conversions: {
    titel: '📈 Meta Conversions API',
    was:
      'Die Cloud meldet dem „D2D Pixel“ echte Ergebnisse, damit Meta auf gute Leads optimiert: jede Funnel-Eintragung als „Lead“ (auch die, die das Browser-Pixel verpasst), ' +
      'Deal auf „Closing – Terminiert“ als „QualifiedLead“ (Beratungsgespräch gelegt) und gewonnene Neukunden als „Purchase“ mit Auftragswert. ' +
      'Kontaktdaten gehen nur verschlüsselt (SHA-256) an Meta. Sparsam: jedes Ereignis genau einmal, nur frische Ereignisse (nichts nachgemeldet), höchstens 25 pro Tag, kein automatisches Wiederholen. Testmodus ohne Freigabe: Test-Code aus dem Events Manager in system_einstellungen „meta_capi_test_code“ – dann nur unter „Ereignisse testen“ sichtbar.',
    wirkt: 'Daten an Meta (keine Nachricht an Leads oder Kunden)',
  },
  upsell_protokoll: {
    titel: '🔁 Upsell-Protokoll umsetzen',
    was:
      '„5 - Gesprächsprotokoll (Upsell)“ → Close: Strategietermin gelegt → Upsell-Deal „Strategietermin gelegt“ (25 %) · Konzepttermin → „Konzept präsentiert“ (40 %) · Entscheidungstermin → „Entscheidung offen“ (60 %, ohne alle Entscheider 45 % + Aufgabe) · ' +
      'Verschoben ohne Datum → Aufgabe „neuen Termin legen“ · Kein Potenzial jetzt → Deal verloren + Wiedervorlage in 3 Monaten · Verloren → Deal verloren mit Grund · Nicht erreicht → gesperrt bis Kalender/morgen · No-Show → Aufgabe · Kunde unzufrieden → Aufgabe „mit Fulfillment klären“. ' +
      'Der Auftragswert aus dem Protokoll landet im Deal (einmalig/monatlich). „Abgeschlossen“ → „Upsell – Gewonnen“ läuft immer. Der Lead bleibt „Kunde“.',
    wirkt: 'Deals, Felder und Aufgaben in Close (keine Nachricht an Kunden)',
  },
  upsell_waechter: {
    titel: '🔁 Upsell-Wächter',
    was:
      'Jeden Morgen prüft die Cloud alle offenen Deals der Pipeline „Upsell (Bestandskunden)“: Hat der Deal keinen nächsten Schritt (keine offene Aufgabe, kein künftiger Termin in Close), ' +
      'bekommt der Deal-Besitzer die Aufgabe „🔁 Upsell <Firma>: nächsten Schritt festlegen“ (einmal, bis sie erledigt ist). Deals ohne Schritt oder seit 5+ Tagen ohne Bewegung stehen oben im CEO-Briefing.',
    wirkt: 'Close-Aufgaben + Briefing an dich (keine Nachricht an Kunden)',
  },
  absage_nachfass: {
    titel: '🗓️ Absage-Nachfass (Calendly)',
    was:
      'Ein Lead sagt sein Erst- oder Beratungsgespräch in Calendly selbst ab → die KI liest den Grund. Ohne Grund: sofort Close-Aufgabe „Anrufen“, nach 2 Std. WhatsApp, falls er nicht erreicht wurde. ' +
      'Krank: WhatsApp „Gute Besserung“ mit zwei freien Zeiten nächste Woche. Urlaub: WhatsApp am Rückkehrtag (sonst nach 14 Tagen). Sonst: WhatsApp mit zwei freien Zeiten morgen/übermorgen. Kein Interesse: nur Close-Aufgabe. ' +
      'Die Zeiten kommen live aus Calendly, kein Buchungslink – die Antwort wird zur Close-Aufgabe am Wunschtag. Setting-Protokoll „Abgesagt“ → Rückruf-Aufgabe (am Kalender-Tag, sonst morgen). Aus: nur an Testnummern.',
    wirkt: 'WhatsApp an den Lead (einmal je Absage, 8–21 Uhr) + Close-Aufgaben',
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
  kunden_warnungen: {
    titel: '⚠️ Kunden-Warnungen (Problem-Erkennung)',
    was: 'Täglich prüfen, ob bei Kunden Bewerber, Meta-Leads, Indeed-Bewerber, Anrufe oder Pipeline-Bewegung fehlen → Warnung beim Kunden + Playbook-Aufgaben fürs Team. Erst einschalten, wenn die Kunden die Cloud aktiv nutzen – sonst lauter Fehlalarme.',
    wirkt: 'Warnungen und Aufgaben intern (keine Nachricht an Kunden)',
  },
  kunden_gespraech_todos: {
    titel: '🎥 To-dos aus Kundengesprächen',
    was: 'Kick-offs, Onboardings und Service-Calls aus Fireflies werden immer dem Kunden zugeordnet und ausgewertet (Stimmung, Zusagen, Risiken). Eingeschaltet legt die Cloud aus jedem Gespräch die To-dos als Aufgaben beim zuständigen Mitarbeiter an (Kundenbetreuer, Media Buyer, Innendienst) und meldet kritische Stimmung sofort.',
    wirkt: 'Interne Aufgaben und Hinweise (keine Nachricht an Kunden)',
  },
  nicht_erreicht_rueckfrage: {
    titel: '📵 Nicht erreicht → WhatsApp-Rückfrage',
    was:
      'Du trägst im Terminierungs-Protokoll „Niemand / Mailbox“ ein → WhatsApp „Hey …, Felix Zoepp hier. Ich habe gerade versucht, dich zu erreichen … Wann kann ich dich besser erreichen?“. ' +
      'Nur an Leads, die sich selbst über einen Funnel eingetragen haben (keine Kaltakquise), höchstens einmal in 7 Tagen, nicht bei gebuchtem Termin oder aktiver Opportunity, nicht 20:30–8:00 Uhr. ' +
      'Die Antwort liest die KI aus → Aufgabe in Close am Wunschtag + Slack. Die Vorlage nicht_erreicht_rueckfrage muss bei Meta freigegeben sein.',
    wirkt: 'WhatsApp an den Lead – ausgelöst durch dein Protokoll',
  },
  eintrag_personalisiert: {
    titel: '🎯 „Kein Termin gebucht“ mit Funnel-Antwort',
    was:
      'Die erste Nachricht der Kette „Eingetragen, aber kein Termin“ nennt die Angabe aus dem Funnel: „Du willst pro Monat 3 bis 5 Vertriebler onboarden. Wie das bei dir konkret geht, zeigen wir dir im Erstgespräch …“. ' +
      'Ohne Angabe im Funnel oder ohne freigegebene Vorlage eintrag_1_termin_v2 geht wie bisher eintrag_1_termin raus.',
    wirkt: 'Ersetzt nur den Text der ersten Nachricht der bestehenden Kette – nicht mehr Nachrichten',
  },
  bewerber_nicht_erreicht_whatsapp: {
    titel: '📲 Bewerber nicht erreicht → WhatsApp',
    was:
      'Wird im Anruf-Modus „Nicht erreicht / Mailbox“ protokolliert, bekommt der Bewerber 2 Minuten später: „Hallo …, wir haben gerade versucht, dich wegen deiner Bewerbung bei <Kunde> anzurufen. Wann erreichen wir dich am besten? …“. ' +
      'Höchstens einmal in 3 Tagen, nicht nachts, nicht bei STOP/Sperre, nicht wenn er inzwischen erreicht wurde. Hat der Bewerber in den letzten 24 h geschrieben, geht kostenloser Freitext raus, sonst die Vorlage bewerber_nicht_erreicht (Service, ca. 0,05 €). ' +
      'Zusätzlich gilt der Bewerber-Kontakt-Schalter – solange der aus ist, nur an Testnummern.',
    wirkt: 'WhatsApp an Bewerber der Kunden – ausgelöst durch das Anruf-Protokoll',
  },
  kunden_zufriedenheit: {
    titel: '📋 2-Wochen-Check an Kunden',
    was:
      'Alle 14 Tage bekommen aktive Kunden den Zufriedenheits-Check per Mail und WhatsApp (Sales-Nummer, Vorlage kunde_zufriedenheit mit Schnellantworten + Link). ' +
      'Ist er nach 2 Tagen offen, kommt die Erinnerung kunde_zufriedenheit_erinnerung („Dein 2-Wochen-Check ist noch offen …“), höchstens 2-mal. Aus: Checks werden nur eingeplant, nichts geht raus.',
    wirkt: 'Mail + WhatsApp an Kunden – täglich im Cron',
  },
  telefonie: {
    titel: '📞 Telefonieren über die Cloud',
    was:
      'Im Anruf-Modus rufen Team und Kunden direkt im Browser an. Absender ist die Nummer aus der Anruf-Einrichtung des Kunden. ' +
      'Mit Aufnahme hört der Angerufene beim Abheben zuerst „Dieses Gespräch wird zur Qualitätssicherung aufgezeichnet“. Die Aufnahme wird transkribiert und ausgewertet und danach bei Twilio gelöscht. ' +
      'Aus: nur Admins können zum Testen telefonieren.',
    wirkt: 'Nur Anrufe, die jemand selbst startet – nichts läuft automatisch',
  },
  whatsapp_nummer_besorgen: {
    titel: '☎️ WhatsApp-Nummer für Kunden besorgen',
    was:
      'In der Kundenakte legt ein Admin per Klick ein Twilio-Unterkonto für den Kunden an, sieht den Stand der Unterlagen (Regulatory Bundle) und kauft nach ausdrücklicher Bestätigung eine deutsche Festnetznummer (Ortsnetz des Kunden, sonst Berlin 030) – kostet monatlich bei Twilio. ' +
      'Den Bestätigungscode, den Meta beim WhatsApp-Einrichten per Anruf oder SMS schickt, fängt die Cloud in einem 15-Minuten-Fenster ab und zeigt ihn in der Kundenakte. ' +
      'Aus: nur der Testlauf (freie Nummern suchen, ohne Kauf) geht.',
    wirkt: 'Nur Schritte, die ein Admin selbst klickt – keine Nachricht an Kunden, nichts läuft automatisch',
  },
  masterclass_fuehrung_teaser: {
    titel: '🎓 Masterclass für Führungskräfte anteasern',
    was:
      'In der Masterclass sehen Kunden ohne Freischaltung oben die Karte „Masterclass für deine Führungskräfte“ (selbst rekrutieren, von uns ausgebildet, rechnet sich mit den ersten zwei Vertrieblern) mit dem Knopf „Für meine Führungskräfte anfragen“. ' +
      'Eine Anfrage legt bei uns eine Aufgabe an (höchstens eine pro Kunde und Woche).',
    wirkt: 'Nur Anzeige im Portal und eine interne Aufgabe – keine Nachricht an den Kunden',
  },
  anruf_modus_wie_close: {
    titel: '📞 Anruf-Modus wie Close',
    was:
      'Im Anruf-Modus: „Nicht erreicht / Mailbox“ sperrt den Bewerber bis morgen 8:00 Uhr (kein zweiter Versuch am selben Tag, nach dem 6. Versuch ist Schluss). ' +
      '„Rückruf gewünscht“ braucht Datum und Uhrzeit – der Bewerber taucht erst dann wieder in der Liste auf, dazu kommt eine interne Aufgabe mit der Notiz. ' +
      'Das Erstgespräch-Skript ist während des Anrufs direkt aufgeklappt. Bewerber werden beim Anrufen nicht nach „Kontaktiert“ verschoben, bestehende Phasen bleiben unverändert. ' +
      'Aus: wie bisher (zweiter Versuch nach 3 Stunden, Rückruf nur mit Datum).',
    wirkt: 'Nur Anruf-Liste und interne Aufgaben – keine Nachricht an Bewerber',
  },
  kontrollzentrum_warnungen: {
    titel: '🚦 Kontrollzentrum: Frühwarnung',
    was:
      'Täglich prüft die Cloud alle Kunden wie im Kontrollzentrum. Wird ein Kunde rot (z. B. Kontaktquote unter 50 %, keine Logins, viele Leads ohne Termin) oder zeigt Churn-Risiko (2 Wochen rot, keine Logins, Leads eingebrochen), ' +
      'bekommt der Kundenbetreuer eine interne Aufgabe mit den Gründen – je Kunde und Grund höchstens eine offene.',
    wirkt: 'Nur interne Aufgaben – keine Nachricht an Kunden',
  },
  report_intern: {
    titel: '📄 Report-Funnel: Slack + Anruf-Aufgabe',
    was:
      'Lädt jemand über einen Perspective-Funnel mit „Report“ im Namen den Report runter, kommt sofort eine Slack-Nachricht in #03-sales, in der du getaggt wirst („jetzt anrufen“, mit Telefonnummer und Close-Link). ' +
      'Hat er 10 Minuten später keinen Termin gebucht, bekommt er in Close die Aufgabe „📄 Report runtergeladen, kein Termin – jetzt anrufen“ und du eine zweite Slack-Nachricht. ' +
      'Report-Leads laufen getrennt vom normalen Funnel: keine Eintrag-Kette, kein Speed-Alarm, eigene Zahlen unter Vertrieb → Report-Funnel und eigener Smart View „📄 3.4 Report runtergeladen – kein Termin“. Die Zahlen werden auch ohne Freigabe erfasst.',
    wirkt: 'Nur intern (Slack + Close-Aufgabe) – keine Nachricht an Leads',
  },
  report_whatsapp: {
    titel: '📲 Report per WhatsApp verschicken',
    was:
      'Direkt nach dem Download bekommt der Lead die WhatsApp-Vorlage report_versand: „Hallo …, hier ist dein Report „…“ …“ mit den Buttons „Report öffnen“ (PDF, Öffnen wird gezählt) und „Erstgespräch buchen“ (Calendly, Klick wird verfolgt). ' +
      'Einmal je Download, sofort (auch abends – er hat den Report gerade selbst angefordert), nicht nach STOP. Die Vorlage muss bei Meta freigegeben und das PDF unter Vertrieb → Report-Funnel hinterlegt sein. Aus: nur an Testnummern.',
    wirkt: 'WhatsApp an den Lead – einmal, ausgelöst durch seinen eigenen Download',
  },
  kunden_bilder_slack: {
    titel: '🖼️ Kundenbilder in Slack',
    was: 'Lädt ein Kunde unter „Deine Aufgaben → Bilder & Branding“ Bilder hoch, kommt eine Slack-Nachricht in den Fulfillment-Kanal (sonst Marketing): welcher Kunde, wie viele Fotos von sich / Team / Arbeitsalltag / Logo, Link zu den Bildern. Mehrere Bilder innerhalb von 5 Minuten kommen als eine Nachricht.',
    wirkt: 'Nur intern in Slack – keine Nachricht an den Kunden',
  },
  bewerber_push: {
    titel: '🔔 Push bei neuem Bewerber (Funnel + Indeed)',
    was:
      'Kommt ein neuer Bewerber über den Perspective-Funnel oder Indeed rein, bekommt das Team des Kunden sofort eine Benachrichtigung in der Cloud (Glocke) und – wenn auf dem Gerät erlaubt – eine Push-Nachricht „Neuer Bewerber: Name · Jetzt anrufen“. ' +
      'Bei Meta-Formular-Leads passiert das schon heute. Nachgeholte oder abgeglichene ältere Bewerber lösen nichts aus.',
    wirkt: 'Nur an die Cloud-Nutzer des Kunden (App/Browser) – keine Nachricht an Bewerber',
  },
  kunden_onboarding_mail: {
    titel: '✉️ Onboarding-Erinnerung per Mail',
    was: 'Hat ein Kunde das Onboarding nach 2, 5 und 10 Tagen nicht ausgefüllt, bekommt der Inhaber eine Erinnerungs-Mail mit Link zum Onboarding. Aus: keine Mail, die Stufe wird trotzdem vermerkt (beim Einschalten wird nichts nachgeholt).',
    wirkt: 'Mail an den Kunden',
  },
  kunden_zahlung_mail: {
    titel: '💶 „Zahlung eingegangen“ per Mail',
    was: 'Erkennt die Cloud die bezahlte Setup-Rechnung in Lexware, bekommt der Kunde eine Mail „Zahlung eingegangen“ mit seinem Zugang. Aus: Zugang und Freischaltung laufen trotzdem, nur die Mail entfällt – das Team bekommt einen Hinweis, den Kunden selbst zu informieren.',
    wirkt: 'Mail an den Kunden',
  },
  kunden_report_auto: {
    titel: '📊 Tag-7/14-Report automatisch senden',
    was: 'Für Automatik-Kunden geht der Tag-7- und Tag-14-Report direkt per Mail an den Kunden. Aus: Der Report wird erstellt und wartet wie bei allen anderen Kunden auf Freigabe und Knopf.',
    wirkt: 'Mail an den Kunden',
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
