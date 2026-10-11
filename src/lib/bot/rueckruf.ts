/**
 * Ablauf nach der Vorqualifizierung: kein Vorstellungsgespräch per Link, sondern ein kurzer Anruf durch den Innendienst.
 * Der KI-Agent fragt zuletzt „Wann bist du für einen kurzen 5-Minuten-Anruf erreichbar?“ (Frage rueckruf_zeit).
 * Die Antwort („morgen ab 10“, „heute nach 17 Uhr“, „egal“) wird in ein Zeitfenster übersetzt; der Bewerber erscheint
 * zu Beginn des Fensters beim Innendienst unter „Anrufe fällig“, 10 Min. vorher kommt eine kurze WhatsApp-Erinnerung.
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { llmJsonCall, DIALOG_MODEL } from '@/lib/ai/llm-client';

export const RUECKRUF_KEY = 'rueckruf_zeit';
export const RUECKRUF_FRAGE = 'Super, fast geschafft! Wann bist du heute oder morgen am besten für einen kurzen 5-Minuten-Anruf erreichbar?';

const MIN = 60_000;

function berlin(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return { wt: p.weekday as string, m: Number(p.hour) * 60 + Number(p.minute) };
}

/** Nächster Anruf-Zeitpunkt in der Arbeitszeit (Mo–Fr 9–19, Sa 10–14), frühestens in 30 Min. (rein, testbar) */
export function naechsterAnrufSlot(jetzt: Date): Date {
  let t = new Date(Math.ceil((jetzt.getTime() + 30 * MIN) / (15 * MIN)) * 15 * MIN);
  for (let i = 0; i < 7 * 24 * 4; i++) {
    const { wt, m } = berlin(t);
    const ok = wt === 'Sun' ? false : wt === 'Sat' ? m >= 600 && m < 840 : m >= 540 && m < 1140;
    if (ok) return t;
    t = new Date(t.getTime() + 15 * MIN);
  }
  return t;
}

/** Fenster plausibilisieren: nicht in der Vergangenheit, max. 7 Tage, Ende nach Start (rein, testbar) */
export function pruefeFenster(von: Date | null, bis: Date | null, jetzt: Date): { von: Date; bis: Date } {
  const frueh = new Date(jetzt.getTime() + 10 * MIN);
  let v = von && !Number.isNaN(von.getTime()) ? von : naechsterAnrufSlot(jetzt);
  if (v < frueh) v = naechsterAnrufSlot(jetzt);
  if (v.getTime() > jetzt.getTime() + 7 * 864e5) v = naechsterAnrufSlot(jetzt);
  let b = bis && !Number.isNaN(bis.getTime()) && bis > v ? bis : new Date(v.getTime() + 60 * MIN);
  if (b.getTime() - v.getTime() > 6 * 60 * MIN) b = new Date(v.getTime() + 2 * 60 * MIN);
  return { von: v, bis: b };
}

export function fensterText(von: Date, bis: Date, jetzt: Date): string {
  const tag = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const heute = tag(jetzt);
  const morgen = tag(new Date(jetzt.getTime() + 864e5));
  const t = tag(von);
  const wann = t === heute ? 'heute' : t === morgen ? 'morgen' : `am ${von.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit' })}`;
  const uhr = (d: Date) => d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  return `${wann} zwischen ${uhr(von)} und ${uhr(bis)} Uhr`;
}

const FensterSchema = z.object({ von: z.string().nullable(), bis: z.string().nullable() });

/** Freitext → Zeitfenster (KI), mit Plausibilisierung und Rückfall auf den nächsten Arbeits-Slot */
export async function leseRueckrufZeit(svc: SupabaseClient, agencyId: string, conversationId: string | null, antwort: string, jetzt: Date = new Date()): Promise<{ von: Date; bis: Date; text: string }> {
  let von: Date | null = null;
  let bis: Date | null = null;
  try {
    const r = await llmJsonCall(svc, {
      agencyId,
      conversationId,
      purpose: 'dialog',
      model: DIALOG_MODEL,
      promptVersion: 'rueckruf-v1',
      system: [
        {
          text:
            'Du wandelst die Antwort eines Bewerbers, wann er für einen kurzen Anruf erreichbar ist, in ein Zeitfenster um. ' +
            `Jetzt ist ${jetzt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (Europe/Berlin). ` +
            'Gib ISO-8601-Zeitpunkte MIT Zeitzonen-Offset von Europe/Berlin zurück. „ab 10“ = 10:00–11:00, „nachmittags“ = 14:00–17:00, „abends“ = 17:00–19:00, „vormittags“ = 9:00–12:00. ' +
            'Ohne Tagesangabe: heute, falls die Zeit noch nicht vorbei ist, sonst morgen. „Egal“/„jederzeit“ oder unklar: von und bis = null. ' +
            'Antworte nur als JSON {"von": string|null, "bis": string|null}.',
        },
      ],
      messages: [{ role: 'user', content: antwort.slice(0, 500) }],
      maxTokens: 200,
      schema: FensterSchema,
    });
    von = r.von ? new Date(r.von) : null;
    bis = r.bis ? new Date(r.bis) : null;
  } catch {
    // Rückfall: nächster Arbeits-Slot
  }
  const f = pruefeFenster(von, bis, jetzt);
  return { ...f, text: fensterText(f.von, f.bis, jetzt) };
}

/** Rückruf beim Innendienst einplanen + Erinnerung an den Bewerber 10 Min. vorher */
export async function planeRueckruf(
  svc: SupabaseClient,
  p: { agencyId: string; candidateId: string; conversationId: string; von: Date; bis: Date; text: string; name: string; label: string | null },
): Promise<void> {
  const { error } = await svc
    .from('candidates')
    .update({
      rueckruf_von: p.von.toISOString(),
      rueckruf_bis: p.bis.toISOString(),
      rueckruf_text: p.text,
      // Erscheint beim Innendienst unter „Anrufe fällig“, sobald das Fenster beginnt
      cadence_active: true,
      cadence_next_at: p.von.toISOString(),
    })
    .eq('id', p.candidateId)
    .eq('agency_id', p.agencyId);
  if (error) throw new Error(`Rückruf nicht gespeichert: ${error.message}`);

  const erinnerung = new Date(p.von.getTime() - 10 * MIN);
  if (erinnerung.getTime() > Date.now()) {
    await svc.from('scheduled_jobs').insert({
      agency_id: p.agencyId,
      type: 'bot.rueckruf_erinnerung',
      run_at: erinnerung.toISOString(),
      payload: { conversation_id: p.conversationId, candidate_id: p.candidateId },
      status: 'pending',
      dedupe_key: `bot.rueckruf_erinnerung:${p.candidateId}:${p.von.toISOString()}`,
    });
  }
  const { createNotificationForInternals } = await import('@/lib/notifications/create');
  await createNotificationForInternals(svc, {
    agency_id: p.agencyId,
    title: `📞 Rückruf ${p.text}: ${p.name}`,
    body: `Vorqualifiziert per WhatsApp${p.label ? ` (Bewertung ${p.label})` : ''}. Kurz-Check, dann Vorstellungsgespräch legen.`,
    type: 'task_due',
    entity_type: 'candidate',
    entity_id: p.candidateId,
    push_url: '/innendienst',
  }).catch(() => {});
}

/** Job bot.rueckruf_erinnerung – nur innerhalb des 24-h-Fensters (freier Text), sonst still auslassen */
export async function erinnereRueckruf(svc: SupabaseClient, agencyId: string, payload: { conversation_id: string; candidate_id: string }): Promise<string> {
  const [{ data: c }, { data: conv }] = await Promise.all([
    svc.from('candidates').select('name, phone_e164, rueckruf_von, rueckruf_text, first_contact_at').eq('id', payload.candidate_id).eq('agency_id', agencyId).maybeSingle(),
    svc.from('conversations').select('id, wa_account_id, window_expires_at').eq('id', payload.conversation_id).eq('agency_id', agencyId).maybeSingle(),
  ]);
  const k = c as { name: string; phone_e164: string | null; rueckruf_von: string | null; rueckruf_text: string | null } | null;
  const v = conv as { id: string; wa_account_id: string; window_expires_at: string | null } | null;
  if (!k?.phone_e164 || !v || !k.rueckruf_von) return 'nichts';
  if (!v.window_expires_at || new Date(v.window_expires_at).getTime() < Date.now()) return 'fenster_zu';
  const { data: acc } = await svc.from('whatsapp_accounts').select('display_number').eq('id', v.wa_account_id).maybeSingle();
  const nummer = (acc as { display_number: string | null } | null)?.display_number;
  const vorname = (k.name || '').split(' ')[0] || '';
  const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
  await sendWhatsAppMessage(svc, {
    agencyId,
    conversationId: v.id,
    candidatePhone: k.phone_e164,
    waAccountId: v.wa_account_id,
    payload: { to: k.phone_e164, type: 'text', text: { body: `Hi ${vorname}, kurze Info: Gleich rufen wir dich wie besprochen an${nummer ? `, und zwar von ${nummer}` : ''}. Bis gleich!` } },
    senderType: 'bot',
        gespraechsZeiten: true,
  });
  return 'gesendet';
}
