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
      { type: 'BUTTONS', buttons: v.buttons },
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
