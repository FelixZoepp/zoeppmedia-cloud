/**
 * 2-Wochen-Zufriedenheits-Check per WhatsApp (Sales-Nummer, Vorlagen kunde_zufriedenheit / _erinnerung).
 * - Start: Vorlage mit drei Schnellantworten + Button zum kompletten Check (persönlicher Link, ohne Login)
 * - Schnellantwort im Chat → Bewertung wird gemerkt und im Formular vorbelegt; der Bot antwortet mit dem Link,
 *   bei „Da geht noch mehr“ bekommt der Kundenberater sofort eine Aufgabe
 * - Erinnerung: höchstens 2-mal, frühestens 2 Tage nach dem letzten Kontakt, solange der Check offen ist
 * Kundennummer: agencies.phone → Kunden-Login → Close (fulfillment/kunden-kontakt.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENCY_ID, SALES_WA_ACCOUNT_ID } from '@/lib/sales/calendly-chain';
import { umfrageLink } from './versand';
import { berlinTag } from '@/lib/zeit/berlin';

export const MAX_UMFRAGE_ERINNERUNGEN = 2;
const ABSTAND_MS = 2 * 864e5;

/** Schnellantworten der Vorlage → Bewertung 1–5 */
export const SCHNELLANTWORTEN: Array<{ text: string; wert: number }> = [
  { text: 'Läuft richtig gut', wert: 5 },
  { text: 'Läuft solide', wert: 4 },
  { text: 'Da geht noch mehr', wert: 2 },
];

interface KundeRoh {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
}

async function vorlage(svc: SupabaseClient, name: string): Promise<{ id: string; name: string } | null> {
  const { data } = await svc
    .from('whatsapp_templates')
    .select('id, name')
    .eq('wa_account_id', SALES_WA_ACCOUNT_ID)
    .eq('preset_key', name)
    .eq('status', 'approved')
    .maybeSingle();
  return (data as { id: string; name: string } | null) ?? null;
}

async function konversation(svc: SupabaseClient, k: KundeRoh, nummer: string): Promise<string> {
  const { kundenKontakt } = await import('@/lib/fulfillment/kunden-kontakt');
  const kontaktId = await kundenKontakt(svc, k, nummer);
  if (!kontaktId) throw new Error('WhatsApp-Kontakt konnte nicht angelegt werden');
  await svc
    .from('conversations')
    .upsert({ agency_id: SALES_AGENCY_ID, candidate_id: kontaktId, wa_account_id: SALES_WA_ACCOUNT_ID, state: 'human_active' }, { onConflict: 'wa_account_id,candidate_id', ignoreDuplicates: true });
  const { data } = await svc.from('conversations').select('id').eq('wa_account_id', SALES_WA_ACCOUNT_ID).eq('candidate_id', kontaktId).single();
  return (data as { id: string }).id;
}

export type WaErgebnis = 'gesendet' | 'keine_nummer' | 'vorlage_fehlt' | 'fehler';

/** Start oder Erinnerung für einen eingeplanten Check verschicken */
export async function sendeUmfrageWhatsApp(svc: SupabaseClient, s: { agency_id: string; token: string }, art: 'start' | 'erinnerung'): Promise<WaErgebnis> {
  const tmpl = await vorlage(svc, art === 'start' ? 'kunde_zufriedenheit' : 'kunde_zufriedenheit_erinnerung');
  if (!tmpl) return 'vorlage_fehlt';
  const { data: ag } = await svc.from('agencies').select('id, name, email, phone, contact_name').eq('id', s.agency_id).maybeSingle();
  const k = ag as KundeRoh | null;
  if (!k) return 'fehler';
  const { kundenNummer } = await import('@/lib/fulfillment/kunden-kontakt');
  const nummer = await kundenNummer(svc, k).catch(() => null);
  if (!nummer) return 'keine_nummer';

  try {
    const conversationId = await konversation(svc, k, nummer);
    const vorname = (k.contact_name ?? '').split(' ')[0] || 'zusammen';
    const components: Array<Record<string, unknown>> = [{ type: 'body', parameters: [{ type: 'text', text: vorname }] }];
    if (art === 'start') {
      SCHNELLANTWORTEN.forEach((a, index) =>
        components.push({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload: `umfrage:${s.token}:${a.wert}` }] }),
      );
    }
    components.push({ type: 'button', sub_type: 'url', index: art === 'start' ? '3' : '0', parameters: [{ type: 'text', text: s.token }] });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await sendWhatsAppMessage(svc, {
      agencyId: SALES_AGENCY_ID,
      conversationId,
      candidatePhone: nummer,
      waAccountId: SALES_WA_ACCOUNT_ID,
      payload: { to: nummer, type: 'template', template: { name: tmpl.name, language: { code: 'de' }, components } },
      senderType: 'system',
      templateId: tmpl.id,
    });
    return 'gesendet';
  } catch (err) {
    console.error('[umfrage-wa] Versand fehlgeschlagen', s.agency_id, err);
    return 'fehler';
  }
}

/** Welche offenen Checks heute erinnert werden (rein, testbar) */
export function faelligeErinnerung(
  s: { completed_at: string | null; wa_gesendet_am: string | null; erinnert_am: string | null; erinnerungen: number; sent_at: string | null; schnell_bewertung?: number | null },
  jetzt: Date,
): boolean {
  // Wer schon per Schnellantwort geantwortet hat, bekommt höchstens eine Erinnerung
  const max = s.schnell_bewertung ? 1 : MAX_UMFRAGE_ERINNERUNGEN;
  if (s.completed_at || s.erinnerungen >= max) return false;
  const start = s.wa_gesendet_am ?? s.sent_at;
  if (!start) return false;
  // Nach 12 Tagen ist der Check verfallen – der nächste kommt ohnehin
  if (jetzt.getTime() - new Date(start).getTime() > 12 * 864e5) return false;
  const letzter = new Date(s.erinnert_am ?? start).getTime();
  return jetzt.getTime() - letzter >= ABSTAND_MS - 3600e3;
}

/** Täglich: offene Checks erinnern */
export async function erinnereUmfragen(svc: SupabaseClient, jetzt: Date = new Date()): Promise<number> {
  const { data } = await svc
    .from('survey_schedule')
    .select('id, agency_id, token, completed_at, wa_gesendet_am, erinnert_am, erinnerungen, sent_at, schnell_bewertung')
    .is('completed_at', null)
    .not('sent_at', 'is', null)
    .gte('sent_at', new Date(jetzt.getTime() - 12 * 864e5).toISOString());
  let n = 0;
  for (const s of (data ?? []) as Array<{ id: string; agency_id: string; token: string; completed_at: string | null; wa_gesendet_am: string | null; erinnert_am: string | null; erinnerungen: number; sent_at: string | null; schnell_bewertung: number | null }>) {
    if (!faelligeErinnerung(s, jetzt)) continue;
    const r = await sendeUmfrageWhatsApp(svc, s, 'erinnerung');
    // Auch ohne Versand vermerken, sonst wird es jeden Tag erneut versucht
    await svc.from('survey_schedule').update({ erinnert_am: jetzt.toISOString(), erinnerungen: s.erinnerungen + 1 }).eq('id', s.id);
    if (r === 'gesendet') n++;
  }
  return n;
}

/**
 * Schnellantwort aus dem Chat (Button-Payload „umfrage:<token>:<wert>“).
 * Gibt true zurück, wenn die Nachricht damit erledigt ist (keine weitere Sales-Auswertung).
 */
export async function verarbeiteUmfrageAntwort(
  svc: SupabaseClient,
  payload: string | undefined,
  ctx: { conversationId: string; phone: string; waAccountId: string },
): Promise<boolean> {
  const m = /^umfrage:([0-9a-f-]{36}):([1-5])$/i.exec(payload ?? '');
  if (!m) return false;
  const [, token, w] = m;
  const wert = Number(w);
  const { data } = await svc
    .from('survey_schedule')
    .select('id, agency_id, completed_at, schnell_bewertung, rueckruf_aufgabe_am, agencies(name, csm_user_id)')
    .eq('token', token)
    .maybeSingle();
  const s = data as unknown as {
    id: string;
    agency_id: string;
    completed_at: string | null;
    schnell_bewertung: number | null;
    rueckruf_aufgabe_am: string | null;
    agencies: { name: string; csm_user_id: string | null } | null;
  } | null;
  if (!s) return false;
  const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
  const sende = (body: string) =>
    sendWhatsAppMessage(svc, {
      agencyId: SALES_AGENCY_ID,
      conversationId: ctx.conversationId,
      candidatePhone: ctx.phone,
      waAccountId: ctx.waAccountId,
      payload: { to: ctx.phone, type: 'text', text: { body } },
      senderType: 'system',
    }).catch((err) => console.error('[umfrage-wa] Antwort fehlgeschlagen', err));
  // Schon beantwortet oder schon bewertet (und ggf. Rückruf-Aufgabe vorhanden) → nur kurz bestätigen
  if (s.completed_at || (s.schnell_bewertung && (s.schnell_bewertung > 2 || s.rueckruf_aufgabe_am))) {
    await sende(s.completed_at ? 'Danke, dein 2-Wochen-Check ist schon bei uns angekommen 🙌' : `Danke, ist notiert! Den kompletten Check findest du hier: ${umfrageLink(token)}`);
    return true;
  }
  const nachholen = !!s.schnell_bewertung;
  if (!nachholen) {
    const { error: uErr } = await svc.from('survey_schedule').update({ schnell_bewertung: wert }).eq('id', s.id).is('schnell_bewertung', null);
    if (uErr) throw new Error(`Schnellantwort nicht gespeichert: ${uErr.message}`);
  }

  const link = umfrageLink(token);
  const text =
    wert >= 4
      ? `Freut mich richtig! 🙌 Magst du mir in 2 Minuten erzählen, was gerade am besten läuft? Das hilft uns, genau daran weiterzuarbeiten: ${link}`
      : `Danke für die ehrliche Antwort – genau das brauchen wir. Was hakt gerade am meisten? Schreib's mir hier oder im kurzen Check: ${link}\n\nDein Kundenberater meldet sich zusätzlich bei dir.`;
  await sende(nachholen ? `Danke, ist notiert! Den kompletten Check findest du hier: ${link}` : text);

  // Rückruf-Aufgabe genau einmal je Check (eindeutig über quelle_ref) – wird bei einem erneuten Tippen nachgeholt, falls sie fehlt
  if ((s.schnell_bewertung ?? wert) <= 2 && !s.rueckruf_aufgabe_am) {
    const kunde = s.agencies?.name ?? 'Kunde';
    const { resolveOwner } = await import('@/lib/fulfillment/engine');
    const betreuer = s.agencies?.csm_user_id ?? (await resolveOwner(svc, 'csm'));
    const { error: tErr } = await svc.from('internal_tasks').insert({
      agency_id: s.agency_id,
      title: `${kunde} anrufen – 2-Wochen-Check: „Da geht noch mehr“`,
      description: 'Schnellantwort im WhatsApp-Check. Heute anrufen, nachfragen, was hakt, und nachschärfen.',
      assigned_to: betreuer,
      priority: 'high',
      due_date: berlinTag(),
      status: 'todo',
      quelle: 'umfrage',
      quelle_ref: `umfrage-rueckruf:${s.id}`,
    });
    if (tErr && tErr.code !== '23505') throw new Error(`Rückruf-Aufgabe nicht angelegt: ${tErr.message}`);
    await svc.from('survey_schedule').update({ rueckruf_aufgabe_am: new Date().toISOString() }).eq('id', s.id);
    if (tErr) return true; // schon vorhanden – nicht erneut benachrichtigen
    if (betreuer) {
      const { createNotification } = await import('@/lib/notifications/create');
      await createNotification(svc, {
        user_id: betreuer,
        agency_id: s.agency_id,
        title: `${kunde}: „Da geht noch mehr“ im 2-Wochen-Check`,
        body: 'Heute anrufen und klären, was hakt.',
        type: 'task_assigned',
        entity_type: 'agency',
        entity_id: s.agency_id,
        push_url: '/tasks',
      }).catch(() => {});
    }
  }
  return true;
}
