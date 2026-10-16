import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret } from '@/lib/crypto';
import { SALES_AGENCY_ID, SALES_WA_ACCOUNT_ID } from './calendly-chain';

/**
 * Sales-WhatsApp-Vorlagen, die die Cloud selbst bei Meta einreicht.
 * setting_buchung_v2: Buchungsbestätigung Erstgespräch mit Kalender- und Ablauf-Video-Button
 * (Gegenstück zu beratung_buchung_v2). Die Kette nimmt sie automatisch, sobald sie freigegeben ist.
 */

const GRAPH = process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com/v23.0';

export interface SalesVorlage {
  name: string;
  category: 'UTILITY' | 'MARKETING';
  body: string;
  variables: string[];
  beispiel: string[];
  buttons: Array<{ type: 'URL'; text: string; url: string; example?: string[] } | { type: 'QUICK_REPLY'; text: string }>;
}

export const SALES_VORLAGEN: SalesVorlage[] = [
  {
    name: 'setting_buchung_v2',
    category: 'UTILITY',
    body:
      'Hallo {{1}}, dein Erstgespräch mit Zoepp Media ist eingetragen: {{2}} um {{3}} Uhr, ca. 15 Minuten am Telefon.\n\n' +
      'Wir rufen dich an, und zwar von 030 82684175. Am besten suchst du dir vorher einen ruhigen Ort.\n\n' +
      'Über den Button unten trägst du den Termin direkt in deinen Kalender ein. Wie das Gespräch abläuft, siehst du vorab im kurzen Video.',
    variables: ['vorname', 'datum', 'uhrzeit'],
    beispiel: ['Mehmet', 'Mittwoch, 07.10.', '14:00'],
    buttons: [
      {
        type: 'URL',
        text: 'Zum Kalender hinzufügen',
        url: 'https://ressourcen.felixzoepp.de/kalender/{{1}}',
        example: ['https://ressourcen.felixzoepp.de/kalender/abc123'],
      },
      { type: 'URL', text: 'So läuft das Gespräch ab', url: 'https://ressourcen.felixzoepp.de/erstgespraech' },
    ],
  },
  {
    // Kunden-Erinnerung an offene Aufgaben (Zugänge, Formular …) – siehe fulfillment/kunden-erinnerung.ts
    name: 'kunde_aufgaben_erinnerung',
    category: 'UTILITY',
    body:
      'Hallo {{1}}, kurzes Update zu deinem Projekt mit Zoepp Media: Damit es weitergeht, fehlt uns noch {{2}}.\n\n' +
      'Zu jedem Punkt findest du in der Zoepp Cloud eine kurze Anleitung, meist dauert es nur ein paar Minuten. Bei Fragen antworte einfach hier.',
    variables: ['vorname', 'aufgaben'],
    beispiel: ['Mehmet', 'der Indeed-Zugang und deine Bilder fürs Branding'],
    buttons: [{ type: 'URL', text: 'Zu deinen Aufgaben', url: 'https://cloud.zoeppmedia.de/deine-aufgaben' }],
  },
  {
    // 2-Wochen-Zufriedenheits-Check (surveys/whatsapp.ts): Schnellantwort im Chat oder kompletter Check per Link
    name: 'kunde_zufriedenheit',
    category: 'UTILITY',
    body:
      'Hallo {{1}}, dein 2-Wochen-Check von Zoepp Media ist da 🙌\n\n' +
      'Wie läuft dein Recruiting gerade? Tipp einfach unten auf eine Antwort – oder nimm dir 2 Minuten für den kompletten Check, ' +
      'damit wir genau dort nachschärfen, wo es dir am meisten bringt.',
    variables: ['vorname'],
    beispiel: ['Mehmet'],
    buttons: [
      { type: 'QUICK_REPLY', text: 'Läuft richtig gut' },
      { type: 'QUICK_REPLY', text: 'Läuft solide' },
      { type: 'QUICK_REPLY', text: 'Da geht noch mehr' },
      {
        type: 'URL',
        text: 'Zum 2-Minuten-Check',
        url: 'https://cloud.zoeppmedia.de/umfrage/{{1}}',
        example: ['https://cloud.zoeppmedia.de/umfrage/6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f'],
      },
    ],
  },
  {
    name: 'kunde_zufriedenheit_erinnerung',
    category: 'UTILITY',
    body:
      'Hallo {{1}}, kurze Erinnerung: Dein 2-Wochen-Check ist noch offen. ' +
      '2 Minuten – und wir wissen, wo wir für dich als Nächstes ansetzen.',
    variables: ['vorname'],
    beispiel: ['Mehmet'],
    buttons: [
      {
        type: 'URL',
        text: 'Zum 2-Minuten-Check',
        url: 'https://cloud.zoeppmedia.de/umfrage/{{1}}',
        example: ['https://cloud.zoeppmedia.de/umfrage/6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f'],
      },
    ],
  },
  {
    // Kette „Eingetragen, aber kein Termin“ (sales/eintrag-kette.ts) – 1) 15 Min. nach der Eintragung
    name: 'eintrag_1_termin',
    category: 'MARKETING',
    body:
      'Hallo {{1}}, schön, dass du dich eingetragen hast! Ein Schritt fehlt noch: Such dir kurz einen Termin für dein Erstgespräch aus.\n\n' +
      'Das dauert nur 15 Minuten am Telefon, und danach weißt du genau, wie dein Vertriebsaufbau mit uns aussehen kann.',
    variables: ['vorname'],
    beispiel: ['Mehmet'],
    buttons: [{ type: 'URL', text: 'Termin buchen', url: 'https://cloud.zoeppmedia.de/api/go/{{1}}', example: ['https://cloud.zoeppmedia.de/api/go/abc123'] }],
  },
  {
    // 2) Am nächsten Tag: Fallstudie B&C mit Damian-Video
    name: 'eintrag_2_fallstudie',
    category: 'MARKETING',
    body:
      'Hallo {{1}}, eine kurze Geschichte, die gut zu deinem Eintrag passt.\n\n' +
      'B&C Direct Sales hat 12 Monate überlegt, ob sie den Vertriebsaufbau angehen. Gestartet sind sie dann mit 2 Mitarbeitern und 15.000 € Monatsumsatz. ' +
      '90 Tage später: 14 Leute und 130.000 € Monatsumsatz. Investiert haben sie dafür einen vierstelligen Betrag.\n\n' +
      'Die bloße Rechnung: Das Plus von 115.000 € im Monat hätten sie auch ein Jahr früher haben können. Allein für die 9 Monate nach dem Aufbau sind das über 1 Million € Umsatz, ' +
      'die durchs Warten liegen geblieben sind. Und da ist noch nicht eingerechnet, dass neue Vertriebler selbst wieder neue werben.\n\n' +
      'Damian erzählt dir in 40 Sekunden selbst, wie es gelaufen ist. Und wenn du nicht 12 Monate warten willst: Hol dir hier deinen Termin.',
    variables: ['vorname'],
    beispiel: ['Mehmet'],
    buttons: [
      { type: 'URL', text: 'Damians Video ansehen', url: 'https://cloud.zoeppmedia.de/gespraech/fallstudie-bc' },
      { type: 'URL', text: 'Termin buchen', url: 'https://cloud.zoeppmedia.de/api/go/{{1}}', example: ['https://cloud.zoeppmedia.de/api/go/abc123'] },
    ],
  },
  {
    // 1) personalisiert (Freigabe eintrag_personalisiert): {{2}} = Funnel-Antwort „Wie viele Vertriebler möchtest du pro Monat onboarden?“
    name: 'eintrag_1_termin_v2',
    category: 'MARKETING',
    body:
      'Hallo {{1}}, schön, dass du dich eingetragen hast! Du willst pro Monat {{2}} onboarden. ' +
      'Wie wir das bei dir konkret umsetzen, zeigen wir dir im Erstgespräch: 15 Minuten am Telefon.\n\n' +
      'Ein Schritt fehlt noch: Such dir kurz einen Termin aus.',
    variables: ['vorname', 'ziel'],
    beispiel: ['David', '3 bis 5 Vertriebler'],
    buttons: [{ type: 'URL', text: 'Termin buchen', url: 'https://cloud.zoeppmedia.de/api/go/{{1}}', example: ['https://cloud.zoeppmedia.de/api/go/abc123'] }],
  },
  {
    // Terminierung „Niemand / Mailbox“ (sales/nicht-erreicht.ts) – Antwort wertet sales/noshow-antwort.ts aus
    name: 'nicht_erreicht_rueckfrage',
    category: 'MARKETING',
    body:
      'Hey {{1}}, Felix Zoepp hier. Ich habe gerade versucht, dich wegen deiner Anfrage zu erreichen, leider ohne Erfolg.\n\n' +
      'Wann kann ich dich besser erreichen? Schreib mir einfach Tag und Uhrzeit, dann rufe ich genau dann an.',
    variables: ['vorname'],
    beispiel: ['David'],
    buttons: [],
  },
  {
    // 3) Tag 3: letzter Anstoß
    name: 'eintrag_3_letzte',
    category: 'MARKETING',
    body:
      'Hallo {{1}}, ich melde mich ein letztes Mal zu deinem Eintrag. Wenn der Vertriebsaufbau bei dir gerade Thema ist, such dir hier einen Termin aus.\n\n' +
      'Und falls es gerade nicht passt, tipp einfach unten auf den Button, dann lasse ich dich in Ruhe.',
    variables: ['vorname'],
    beispiel: ['Mehmet'],
    buttons: [
      { type: 'URL', text: 'Termin buchen', url: 'https://cloud.zoeppmedia.de/api/go/{{1}}', example: ['https://cloud.zoeppmedia.de/api/go/abc123'] },
      { type: 'QUICK_REPLY', text: 'Gerade kein Thema' },
    ],
  },
  {
    // No-Show Erstgespräch (sales/noshow.ts): Rückfrage nach besserer Erreichbarkeit + Dringlichkeit mit Fallstudie B&C.
    // Die Antwort liest die Cloud aus (sales/noshow-antwort.ts) → Close-Aufgabe + Slack.
    name: 'noshow_setting_rueckfrage',
    category: 'MARKETING',
    body:
      'Hallo {{1}}, wir hatten heute dein Erstgespräch eingeplant, leider haben wir dich nicht erreicht.\n\n' +
      'Wann kann ich dich besser erreichen? Schreib mir einfach Tag und Uhrzeit, dann rufe ich genau dann an.\n\n' +
      'Warum ich dranbleibe: B&C Direct Sales hat 12 Monate gewartet, bevor sie mit uns gestartet sind. In 90 Tagen haben wir sie dann auf über 130.000 € Monatsumsatz gebracht. ' +
      'Die 12 Monate davor haben sie viel Geld gekostet, und genau das soll bei dir nicht passieren. Damian erzählt es dir in 40 Sekunden selbst.',
    variables: ['vorname'],
    beispiel: ['Mehmet'],
    buttons: [{ type: 'URL', text: 'Damians Video ansehen', url: 'https://cloud.zoeppmedia.de/gespraech/fallstudie-bc' }],
  },
  {
    // No-Show Beratungsgespräch (sales/noshow.ts): Rückfrage + alle Entscheider + Dringlichkeit mit Fallstudie David Hamid
    name: 'noshow_closing_rueckfrage',
    category: 'MARKETING',
    body:
      'Hallo {{1}}, wir waren heute zu deinem Beratungsgespräch verabredet, leider bist du nicht in den Call gekommen.\n\n' +
      'Wann passt es dir besser? Schreib mir Tag und Uhrzeit und wer bei euch mitentscheidet, dann lege ich den Termin so, dass alle dabei sind.\n\n' +
      'Warum ich dranbleibe: David Hamid ist mit uns von 2 auf 24 Vertriebler gewachsen. Jeder Monat, den du wartest, ist ein Monat ohne diese Leute. Wie es bei ihm gelaufen ist, siehst du im Video.',
    variables: ['vorname'],
    beispiel: ['Mehmet'],
    buttons: [{ type: 'URL', text: 'Davids Video ansehen', url: 'https://cloud.zoeppmedia.de/gespraech/fallstudie-david' }],
  },
  {
    // Lead hat in Calendly abgesagt (sales/absage.ts): {{2}} = Satz je Grund mit zwei freien Zeiten aus Calendly.
    // Kein Buchungslink – die Antwort liest die Cloud aus (sales/noshow-antwort.ts) → Close-Aufgabe am Wunschtag.
    name: 'absage_rueckfrage',
    category: 'UTILITY',
    body:
      'Hallo {{1}}, ich habe gesehen, dass du unser Gespräch absagen musstest. {{2}}\n\n' +
      'Schreib mir einfach kurz, was dir passt, oder nenn mir eine andere Zeit. Dann trage ich dich direkt ein.',
    variables: ['vorname', 'satz'],
    beispiel: ['Mehmet', 'Gute Besserung! Lass uns gerne einen neuen Termin für nächste Woche finden. Passt dir Dienstag (20.10.) um 10:00 Uhr oder Mittwoch (21.10.) um 14:30 Uhr?'],
    buttons: [],
  },
  {
    // Interne Morgenliste für das Team (aufgaben/tagesliste.ts) – Antwort „erledigt 2“ hakt ab
    name: 'team_aufgaben_heute',
    category: 'UTILITY',
    body:
      'Guten Morgen {{1}}, das steht heute auf deinem Board: {{2}}\n\n' +
      'Zum Abhaken antworte einfach mit „erledigt“ und der Nummer, zum Beispiel „erledigt 2“ oder „erledigt 1 3“.',
    variables: ['vorname', 'liste'],
    beispiel: ['Nils', '1) Ad-Video Turhan schneiden (überfällig) · 2) Kunden-Reports raus · 3) Thumbnail Website-Video'],
    buttons: [{ type: 'URL', text: 'Zum Board', url: 'https://cloud.zoeppmedia.de/boards' }],
  },
  {
    // Morgen-Briefing für die Geschäftsführung (src/lib/berichte/ceo-briefing.ts)
    name: 'ceo_briefing',
    category: 'UTILITY',
    body:
      'Guten Morgen {{1}}, hier ist dein Briefing für {{2}}.\n\n' +
      '🚨 Auf einen Blick: {{3}}\n\n' +
      '💼 Sales: {{4}}\n\n' +
      '📣 Marketing: {{5}}\n\n' +
      '👥 Kunden und Bewerber: {{6}}\n\n' +
      'Alle Details, Ausnahmen und offenen Entscheidungen findest du in der Cloud.',
    variables: ['vorname', 'datum', 'alarme', 'sales', 'marketing', 'kunden'],
    beispiel: [
      'Felix',
      'Dienstag, 13. Oktober',
      '🔴 0 Abschlüsse in den letzten 7 Tagen · 🟡 3 Kunden auf Rot',
      '2 Abschlüsse (12.000 €) · 4 Closings · 9 Settings · Show-up 90 % · Monat 90.000 € von 300.000 € (30 %), Prognose 220.000 €',
      '300 € Ausgaben · 6 Leads · 50 € pro Lead (Ø 45 €)',
      '140 Bewerber · 30 Kunden 🟢 20 🟡 7 🔴 3',
    ],
    buttons: [{ type: 'URL', text: 'Briefing öffnen', url: 'https://cloud.zoeppmedia.de/admin/briefing' }],
  },
  {
    // Interner Sales-Alarm an die Geschäftsführung (src/lib/sales/speed-to-lead.ts) – nie an Leads
    name: 'sales_alarm',
    category: 'UTILITY',
    body: '⚠️ Sales-Alarm: {{1}}\n\n{{2}}\n\nBitte direkt in Close erledigen.',
    variables: ['titel', 'details'],
    beispiel: ['Neue Eintragung seit 30 Min. nicht angerufen', 'Max Muster (Muster GmbH), eingetragen um 09:12 Uhr über Instagram – Telefon +49 151 2345678'],
    buttons: [{ type: 'URL', text: 'Sales-Controlling', url: 'https://cloud.zoeppmedia.de/admin/vertrieb' }],
  },
];

async function zugang(svc: SupabaseClient): Promise<{ wabaId: string; token: string }> {
  const { data } = await svc.from('whatsapp_accounts').select('waba_id, access_token_enc').eq('id', SALES_WA_ACCOUNT_ID).single();
  const a = data as { waba_id: string; access_token_enc: string } | null;
  if (!a?.waba_id || !a.access_token_enc) throw new Error('Sales-WhatsApp-Konto nicht gefunden');
  return { wabaId: a.waba_id, token: decryptSecret(a.access_token_enc) };
}

/** Vorlage bei Meta einreichen und in der Cloud als „pending“ anlegen */
export async function reicheSalesVorlageEin(svc: SupabaseClient, name: string): Promise<{ status: string; metaId: string | null; fehler?: string }> {
  const v = SALES_VORLAGEN.find((x) => x.name === name);
  if (!v) throw new Error(`Unbekannte Vorlage ${name}`);
  const { wabaId, token } = await zugang(svc);

  const definition = {
    name: v.name,
    language: 'de',
    category: v.category,
    components: [
      { type: 'BODY', text: v.body, example: { body_text: [v.beispiel] } },
      ...(v.buttons.length ? [{ type: 'BUTTONS', buttons: v.buttons }] : []),
    ],
  };
  const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(definition),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: { message?: string; error_user_msg?: string } };
  if (!res.ok || !data.id) {
    return { status: 'fehler', metaId: null, fehler: data.error?.error_user_msg || data.error?.message || `HTTP ${res.status}` };
  }

  const status = (data.status ?? 'PENDING').toLowerCase();
  await speichereVorlage(svc, v, status, data.id);
  return { status, metaId: data.id };
}

/** Vorlage in der Cloud anlegen bzw. aktualisieren (eindeutig je Konto + preset_key) */
async function speichereVorlage(svc: SupabaseClient, v: SalesVorlage, status: string, metaId: string | null): Promise<void> {
  const { error } = await svc.from('whatsapp_templates').upsert(
    {
      agency_id: SALES_AGENCY_ID,
      wa_account_id: SALES_WA_ACCOUNT_ID,
      name: v.name,
      language: 'de',
      category: v.category.toLowerCase(),
      body: v.body,
      variables: v.variables,
      buttons: v.buttons,
      status: status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending',
      preset_key: v.name,
      ...(metaId ? { meta_template_id: metaId } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wa_account_id,preset_key' },
  );
  if (error) throw new Error(`Vorlage ${v.name} nicht gespeichert: ${error.message}`);
}

/** Freigabe-Status der Sales-Vorlagen bei Meta abfragen und in der Cloud nachziehen */
export async function aktualisiereSalesVorlagen(svc: SupabaseClient): Promise<Array<{ name: string; status: string; grund?: string | null }>> {
  const { wabaId, token } = await zugang(svc);
  const namen = SALES_VORLAGEN.map((v) => v.name);
  const res = await fetch(`${GRAPH}/${wabaId}/message_templates?limit=200&fields=id,name,status,rejected_reason,language`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as { data?: Array<{ name: string; status: string; rejected_reason?: string; language: string }> };
  const treffer = (data.data ?? []).filter((t) => namen.includes(t.name) && t.language === 'de');
  for (const t of treffer) {
    // Legt fehlende Zeilen an (z. B. wenn das Speichern beim Einreichen gescheitert war) und zieht den Status nach
    const v = SALES_VORLAGEN.find((x) => x.name === t.name)!;
    await speichereVorlage(svc, v, t.status.toLowerCase(), (t as { id?: string }).id ?? null);
  }
  return treffer.map((t) => ({ name: t.name, status: t.status.toLowerCase(), grund: t.rejected_reason ?? null }));
}
