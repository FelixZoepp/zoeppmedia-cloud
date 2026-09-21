/**
 * 10 Vorlagen-Presets aus Spec Abschn. 7.
 * Kategorie UTILITY, Sprache de, deutsche Bodies mit echten Umlauten.
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
  buttons?: Array<{ type: string; text: string }>;
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    presetKey: 'application_received',
    name: 'application_received',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, danke für deine Bewerbung als {{2}} bei {{3}}. Damit wir dich schnell einordnen können, haben wir 3 bis 5 kurze Fragen an dich. Das dauert etwa 2 Minuten.',
    variables: ['vorname', 'jobtitel', 'firmenname'],
    buttons: [{ type: 'QUICK_REPLY', text: "Los geht's" }],
  },
  {
    presetKey: 'qualification_nudge',
    name: 'qualification_nudge',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, wir haben noch keine Antwort von dir erhalten. Hast du kurz Zeit für ein paar Fragen zu deiner Bewerbung als {{2}}? Dauert nur 2 Minuten.',
    variables: ['vorname', 'jobtitel'],
  },
  {
    presetKey: 'qualification_resume',
    name: 'qualification_resume',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, wir hatten neulich angefangen, ein paar Fragen zu klären. Magst du kurz weitermachen? Wir sind fast durch.',
    variables: ['vorname'],
  },
  {
    presetKey: 'appointment_invite',
    name: 'appointment_invite',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, super Profil! Wir würden dich gerne persönlich kennenlernen. Buch dir hier einen passenden Termin für ein kurzes Gespräch zur Stelle als {{2}}: {{3}}',
    variables: ['vorname', 'jobtitel', 'buchungslink'],
  },
  {
    presetKey: 'appointment_confirmation',
    name: 'appointment_confirmation',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, dein Termin ist bestätigt: {{2}} um {{3}} Uhr, {{4}}. Wir freuen uns auf dich!',
    variables: ['vorname', 'datum', 'uhrzeit', 'ort_oder_link'],
  },
  {
    presetKey: 'appointment_reminder_24h',
    name: 'appointment_reminder_24h',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, kurze Erinnerung: Morgen am {{2}} um {{3}} Uhr ist dein Vorstellungsgespräch. Bist du dabei?',
    variables: ['vorname', 'datum', 'uhrzeit'],
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
  },
  {
    presetKey: 'no_show_followup',
    name: 'no_show_followup',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, schade, dass es heute nicht geklappt hat. Kein Problem — buch dir einfach einen neuen Termin: {{2}}',
    variables: ['vorname', 'buchungslink'],
  },
  {
    presetKey: 'documents_request',
    name: 'documents_request',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, für die nächsten Schritte benötigen wir noch: {{2}}. Kannst du das bitte hier per Nachricht schicken?',
    variables: ['vorname', 'unterlage'],
  },
  {
    presetKey: 'status_update',
    name: 'status_update',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, ein kurzes Update zu deiner Bewerbung als {{2}}: {{3}}',
    variables: ['vorname', 'jobtitel', 'freitext'],
  },
];

/**
 * Erstellt Vorlagen-Rows in der DB und submitted sie an Meta.
 * Aufgerufen beim Verbinden einer WhatsApp-Nummer.
 */
export async function seedTemplatesForAccount(
  svc: SupabaseClient,
  waAccountId: string,
  agencyId: string
): Promise<void> {
  const { data: waAccount } = await svc
    .from('whatsapp_accounts')
    .select('waba_id, access_token_enc')
    .eq('id', waAccountId)
    .single();

  if (!waAccount) return;

  const token = decryptSecret(waAccount.access_token_enc);
  const provider = getProvider();

  for (const preset of TEMPLATE_PRESETS) {
    // Row anlegen mit status pending
    const { data: tmplRow } = await svc
      .from('whatsapp_templates')
      .insert({
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
      })
      .select('id')
      .single();

    if (!tmplRow) continue;

    // An Meta submitten
    try {
      const components: Array<Record<string, unknown>> = [
        {
          type: 'BODY',
          text: preset.body,
          example: {
            body_text: [preset.variables.map((_, i) => `Beispiel${i + 1}`)],
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
        .update({ meta_template_id: metaId })
        .eq('id', tmplRow.id);
    } catch {
      // Fehler beim Submit — bleibt pending, Sync-Cron holt es nach
    }
  }
}
