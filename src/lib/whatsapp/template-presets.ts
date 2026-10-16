/**
 * Vorlagen-Presets aus Spec Abschn. 7 (+ „Nicht erreicht“ aus dem Anruf-Modus).
 * Kategorie UTILITY, Sprache de, deutsche Bodies mit echten Umlauten.
 * Meta-Regeln: Body darf nicht mit einer Variable beginnen oder enden, Beispielwerte müssen realistisch sein,
 * keine Emojis in Buttons. Die erste Nachricht nennt die Abmeldung per STOP.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getProvider, type TemplateDefinition } from './provider';
import { decryptSecret } from '@/lib/crypto';

export interface TemplatePreset {
  presetKey: string;
  name: string;
  category: string;
  language: string;
  body: string;
  variables: string[];
  /** Realistische Beispielwerte für die Prüfung durch Meta (gleiche Reihenfolge wie variables) */
  beispiel: string[];
  buttons?: Array<{ type: string; text: string }>;
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    presetKey: 'application_received',
    name: 'application_received',
    category: 'UTILITY',
    language: 'de',
    body:
      'Hallo {{1}}, danke für deine Bewerbung als {{2}} bei {{3}}. Damit wir dich schnell einordnen können, haben wir 3 bis 5 kurze Fragen an dich. Das dauert etwa 2 Minuten.\n\n' +
      'Du möchtest keine Nachrichten mehr? Antworte einfach mit STOP.',
    variables: ['vorname', 'jobtitel', 'firmenname'],
    beispiel: ['Mehmet', 'Vertriebsmitarbeiter im Außendienst', 'Solar Nord GmbH'],
    buttons: [{ type: 'QUICK_REPLY', text: "Los geht's" }],
  },
  {
    presetKey: 'qualification_nudge',
    name: 'qualification_nudge',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, wir haben noch keine Antwort von dir erhalten. Hast du kurz Zeit für ein paar Fragen zu deiner Bewerbung als {{2}}? Dauert nur 2 Minuten.',
    variables: ['vorname', 'jobtitel'],
    beispiel: ['Mehmet', 'Vertriebsmitarbeiter im Außendienst'],
  },
  {
    presetKey: 'qualification_resume',
    name: 'qualification_resume',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, wir hatten neulich angefangen, ein paar Fragen zu klären. Magst du kurz weitermachen? Wir sind fast durch.',
    variables: ['vorname'],
    beispiel: ['Mehmet'],
  },
  {
    presetKey: 'appointment_invite',
    name: 'appointment_invite',
    category: 'UTILITY',
    language: 'de',
    body:
      'Hallo {{1}}, super Profil! Wir würden dich gerne persönlich kennenlernen. Buch dir hier einen passenden Termin für ein kurzes Gespräch zur Stelle als {{2}}: {{3}}\n\n' +
      'Wir freuen uns auf dich!',
    variables: ['vorname', 'jobtitel', 'buchungslink'],
    beispiel: ['Mehmet', 'Vertriebsmitarbeiter im Außendienst', 'https://cloud.zoeppmedia.de/book/abc123'],
  },
  {
    presetKey: 'appointment_confirmation',
    name: 'appointment_confirmation',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, dein Termin ist bestätigt: {{2}} um {{3}} Uhr, {{4}}. Wir freuen uns auf dich!',
    variables: ['vorname', 'datum', 'uhrzeit', 'ort_oder_link'],
    beispiel: ['Mehmet', 'Dienstag, 14.10.', '10:30', 'Hauptstraße 5 in Hamburg'],
  },
  {
    presetKey: 'appointment_reminder_24h',
    name: 'appointment_reminder_24h',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, kurze Erinnerung: Morgen am {{2}} um {{3}} Uhr ist dein Vorstellungsgespräch. Bist du dabei?',
    variables: ['vorname', 'datum', 'uhrzeit'],
    beispiel: ['Mehmet', '14.10.', '10:30'],
    buttons: [
      { type: 'QUICK_REPLY', text: 'Ich komme' },
      { type: 'QUICK_REPLY', text: 'Verschieben' },
    ],
  },
  {
    // Termine vor Ort (Einzelgespräch vor Ort, Vorstellungsrunde): Erinnerung mit vollständiger Adresse
    presetKey: 'appointment_reminder_24h_ort',
    name: 'appointment_reminder_24h_ort',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, kurze Erinnerung: Morgen am {{2}} um {{3}} Uhr ist dein Termin vor Ort bei {{4}}. Adresse: {{5}}. Bist du dabei?',
    variables: ['vorname', 'datum', 'uhrzeit', 'firmenname', 'adresse'],
    beispiel: ['Mehmet', '14. Oktober', '17:00', 'Solar Nord GmbH', 'Hauptstraße 5, 20095 Hamburg (Klingel Solar Nord, 2. OG)'],
    buttons: [
      { type: 'QUICK_REPLY', text: 'Ich komme' },
      { type: 'QUICK_REPLY', text: 'Verschieben' },
    ],
  },
  {
    presetKey: 'appointment_reminder_2h',
    name: 'appointment_reminder_2h',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, in 2 Stunden (um {{2}} Uhr) ist dein Gespräch. Ort/Link: {{3}}. Bis gleich!',
    variables: ['vorname', 'uhrzeit', 'ort_oder_link'],
    beispiel: ['Mehmet', '10:30', 'Hauptstraße 5 in Hamburg'],
  },
  {
    presetKey: 'no_show_followup',
    name: 'no_show_followup',
    category: 'UTILITY',
    language: 'de',
    body:
      'Hallo {{1}}, schade, dass es heute nicht geklappt hat. Kein Problem, buch dir einfach einen neuen Termin: {{2}}\n\n' +
      'Falls etwas dazwischengekommen ist, antworte gern kurz hier.',
    variables: ['vorname', 'buchungslink'],
    beispiel: ['Mehmet', 'https://cloud.zoeppmedia.de/book/abc123'],
  },
  {
    presetKey: 'documents_request',
    name: 'documents_request',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, für die nächsten Schritte benötigen wir noch: {{2}}. Kannst du das bitte hier per Nachricht schicken?',
    variables: ['vorname', 'unterlage'],
    beispiel: ['Mehmet', 'eine Kopie deines Führerscheins'],
  },
  {
    presetKey: 'status_update',
    name: 'status_update',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, ein kurzes Update zu deiner Bewerbung als {{2}}: {{3}}\n\nBei Fragen antworte einfach hier.',
    variables: ['vorname', 'jobtitel', 'freitext'],
    beispiel: ['Mehmet', 'Vertriebsmitarbeiter im Außendienst', 'Dein Probetag ist für Donnerstag eingeplant'],
  },
  {
    // Anruf-Modus „Nicht erreicht / Mailbox“ (Freigabe bewerber_nicht_erreicht_whatsapp)
    presetKey: 'bewerber_nicht_erreicht',
    name: 'bewerber_nicht_erreicht',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, wir haben gerade versucht, dich wegen deiner Bewerbung bei {{2}} anzurufen. Wann erreichen wir dich am besten? Schreib uns einfach Tag und Uhrzeit, dann rufen wir genau dann an.',
    variables: ['vorname', 'firmenname'],
    beispiel: ['Mehmet', 'Solar Nord GmbH'],
  },
];

/**
 * Erstellt Vorlagen-Rows in der DB und submitted sie an Meta.
 * Aufgerufen beim Verbinden einer WhatsApp-Nummer.
 */
export async function seedTemplatesForAccount(
  svc: SupabaseClient,
  waAccountId: string,
  agencyId: string,
  nurPresets?: string[],
): Promise<void> {
  const { data: waAccount } = await svc
    .from('whatsapp_accounts')
    .select('waba_id, access_token_enc')
    .eq('id', waAccountId)
    .single();

  if (!waAccount) return;

  const token = decryptSecret(waAccount.access_token_enc);
  const provider = getProvider();

  for (const preset of TEMPLATE_PRESETS.filter((p) => !nurPresets || nurPresets.includes(p.presetKey))) {
    // Row anlegen mit status pending — idempotent via Unique-Index auf (wa_account_id, preset_key)
    const { data: tmplRow, error: insertError } = await svc
      .from('whatsapp_templates')
      .upsert(
        {
          agency_id: agencyId,
          wa_account_id: waAccountId,
          name: preset.name,
          language: preset.language,
          category: preset.category,
          body: preset.body,
          variables: preset.variables,
          buttons: preset.buttons || null,
          status: 'pending',
          preset_key: preset.presetKey,
        },
        { onConflict: 'wa_account_id,preset_key' }
      )
      .select('id')
      .single();

    if (insertError) {
      console.warn('Template-Seed: Insert fehlgeschlagen', insertError.message);
      continue;
    }

    if (!tmplRow) continue;

    // An Meta submitten
    try {
      const components: Array<Record<string, unknown>> = [
        {
          type: 'BODY',
          text: preset.body,
          example: {
            body_text: [preset.beispiel],
          },
        },
      ];

      if (preset.buttons) {
        components.push({
          type: 'BUTTONS',
          buttons: preset.buttons.map(b => ({
            type: b.type,
            text: b.text,
          })),
        });
      }

      const definition: TemplateDefinition = {
        name: preset.name,
        language: preset.language,
        category: preset.category,
        components,
      };

      const { id: metaId } = await provider.createTemplate(waAccount.waba_id, token, definition);

      await svc.from('whatsapp_templates')
        .update({ meta_template_id: metaId, meta_fehler: null, eingereicht_am: new Date().toISOString() })
        .eq('id', tmplRow.id);
    } catch (err) {
      // Fehler sichtbar machen – die stündliche Vorlagen-Pflege reicht fehlende Vorlagen erneut ein
      await svc.from('whatsapp_templates')
        .update({ meta_fehler: (err instanceof Error ? err.message : String(err)).slice(0, 500), eingereicht_am: new Date().toISOString() })
        .eq('id', tmplRow.id);
    }
  }
}
