/**
 * Worker für die Sales-Kette (Zoepp Media intern):
 * Verarbeitet die von der Calendly-Buchung geplanten Jobs
 * sales.booking / sales.confirmation / sales.reminder / sales.noshow_check.
 *
 * Templates pro Kette:
 *   setting:  setting_buchung → setting_bestaetigung → setting_reminder_15min
 *   beratung: beratung_buchung → beratung_bestaetigung → beratung_reminder_1h
 * noshow_check: nur Notification an Felix (kein Auto-Versand, Spec: Anruf zuerst).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { isQuietHours, nextAllowedTime } from '@/lib/whatsapp/window';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';
import type { SalesChain } from '@/lib/sales/calendly-chain';

export interface SalesJobPayload {
  calendly_event_id: string;
  chain: SalesChain;
}

const TIMEZONE = 'Europe/Berlin';
/** Absender-Name in setting_buchung ({{2}}) — Felix schreibt selbst. */
const SALES_SENDER_NAME = 'Felix';

interface SalesEventContext {
  event: {
    id: string;
    candidate_id: string;
    agency_id: string;
    start_time: string;
    end_time: string | null;
  };
  candidate: { id: string; name: string; phone_e164: string };
  conversation: { id: string; wa_account_id: string };
}

/**
 * Gemeinsamer Lade-Pfad: calendly_event (Guard: noch scheduled) → Candidate
 * (Gates: opt-in + phone_e164) → Conversation. Null = Job still beenden.
 */
async function loadContext(
  svc: SupabaseClient,
  agencyId: string,
  calendlyEventId: string,
): Promise<SalesEventContext | null> {
  const { data: evt } = await svc
    .from('calendly_events')
    .select('id, candidate_id, agency_id, start_time, end_time, status')
    .eq('calendly_event_id', calendlyEventId)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!evt) return null;
  const event = evt as {
    id: string;
    candidate_id: string | null;
    agency_id: string;
    start_time: string;
    end_time: string | null;
    status: string;
  };
  // Storno-Guard: nur senden solange die Buchung steht
  if (event.status !== 'scheduled' || !event.candidate_id) return null;

  const { data: cand } = await svc
    .from('candidates')
    .select('id, name, phone_e164, whatsapp_opt_in')
    .eq('id', event.candidate_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  const candidate = cand as {
    id: string;
    name: string;
    phone_e164: string | null;
    whatsapp_opt_in: boolean;
  } | null;
  if (!candidate?.whatsapp_opt_in || !candidate.phone_e164) return null;

  const { data: conv } = await svc
    .from('conversations')
    .select('id, wa_account_id')
    .eq('candidate_id', candidate.id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!conv) return null;

  return {
    event: {
      id: event.id,
      candidate_id: event.candidate_id,
      agency_id: event.agency_id,
      start_time: event.start_time,
      end_time: event.end_time,
    },
    candidate: {
      id: candidate.id,
      name: candidate.name || '',
      phone_e164: candidate.phone_e164,
    },
    conversation: conv as { id: string; wa_account_id: string },
  };
}

function formatVars(name: string, startTime: string): { vorname: string; datum: string; uhrzeit: string } {
  const start = new Date(startTime);
  return {
    vorname: name.split(' ')[0] || 'du',
    datum: start.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: TIMEZONE }),
    uhrzeit: start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE }),
  };
}

/** "heute"/"morgen"/Datum — für die Bestätigungs-Templates ({{2}}). */
function relativeDay(startTime: string, now: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString('de-DE', { timeZone: TIMEZONE });
  const startDay = fmt(new Date(startTime));
  if (startDay === fmt(now)) return 'heute';
  if (startDay === fmt(new Date(now.getTime() + 24 * 60 * 60 * 1000))) return 'morgen';
  return new Date(startTime).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: TIMEZONE });
}

async function loadTemplate(
  svc: SupabaseClient,
  agencyId: string,
  waAccountId: string,
  presetKey: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await svc
    .from('whatsapp_templates')
    .select('id, name')
    .eq('wa_account_id', waAccountId)
    .eq('preset_key', presetKey)
    .eq('status', 'approved')
    .eq('agency_id', agencyId)
    .maybeSingle();
  return (data as { id: string; name: string } | null) ?? null;
}

interface SendTemplateOpts {
  bodyParams: string[];
  /** Text-Parameter für den URL-Button (index 0), z.B. Calendly-Event-ID */
  urlButtonParam?: string;
  bypassQuietHours: boolean;
}

async function sendSalesTemplate(
  svc: SupabaseClient,
  agencyId: string,
  ctx: SalesEventContext,
  presetKey: string,
  opts: SendTemplateOpts,
): Promise<boolean> {
  const tmpl = await loadTemplate(svc, agencyId, ctx.conversation.wa_account_id, presetKey);
  if (!tmpl) {
    await createNotificationForInternals(svc, {
      agency_id: agencyId,
      title: 'Sales-Template fehlt',
      body: `Template ${presetKey} ist nicht approved — Nachricht an ${ctx.candidate.name} wurde nicht gesendet.`,
      type: 'system',
      push_url: '/settings',
    }).catch(() => {});
    return false;
  }

  const components: Array<Record<string, unknown>> = [
    {
      type: 'body',
      parameters: opts.bodyParams.map((text) => ({ type: 'text', text })),
    },
  ];
  if (opts.urlButtonParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: opts.urlButtonParam }],
    });
  }

  await sendWhatsAppMessage(svc, {
    agencyId,
    conversationId: ctx.conversation.id,
    candidatePhone: ctx.candidate.phone_e164,
    waAccountId: ctx.conversation.wa_account_id,
    payload: {
      to: ctx.candidate.phone_e164,
      type: 'template',
      template: {
        name: tmpl.name,
        language: { code: 'de' },
        components,
      },
    },
    senderType: 'system',
    templateId: tmpl.id,
    bypassQuietHours: opts.bypassQuietHours,
  });

  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: ctx.candidate.id,
    action: `Sales-Nachricht gesendet (${presetKey})`,
    // activity_log.action_type hat eine CHECK-Liste — Sales-Typ steht in metadata.kind
    action_type: 'other',
    metadata: { kind: 'sales_message_sent', calendly_event_id: ctx.event.id, preset_key: presetKey },
  });

  return true;
}

// ---------------------------------------------------------------------------
// sales.booking — Buchungsbestätigung, sofort (bypassQuietHours)
// ---------------------------------------------------------------------------

export async function processSalesBooking(
  svc: SupabaseClient,
  agencyId: string,
  payload: SalesJobPayload,
): Promise<void> {
  const ctx = await loadContext(svc, agencyId, payload.calendly_event_id);
  if (!ctx) return;

  const { vorname, datum, uhrzeit } = formatVars(ctx.candidate.name, ctx.event.start_time);

  if (payload.chain === 'setting') {
    // setting_buchung: {{1}} vorname, {{2}} absender, {{3}} datum, {{4}} uhrzeit + Kalender-Button
    await sendSalesTemplate(svc, agencyId, ctx, 'setting_buchung', {
      bodyParams: [vorname, SALES_SENDER_NAME, datum, uhrzeit],
      urlButtonParam: payload.calendly_event_id,
      bypassQuietHours: true,
    });
  } else {
    // beratung_buchung: {{1}} vorname, {{2}} datum, {{3}} uhrzeit + Kalender-Button
    await sendSalesTemplate(svc, agencyId, ctx, 'beratung_buchung', {
      bodyParams: [vorname, datum, uhrzeit],
      urlButtonParam: payload.calendly_event_id,
      bypassQuietHours: true,
    });
  }
}

// ---------------------------------------------------------------------------
// sales.confirmation — Bestätigungs-Anfrage (Ruhezeiten-Verschiebung)
// ---------------------------------------------------------------------------

export async function processSalesConfirmation(
  svc: SupabaseClient,
  agencyId: string,
  payload: SalesJobPayload,
): Promise<void> {
  const ctx = await loadContext(svc, agencyId, payload.calendly_event_id);
  if (!ctx) return;

  // Ruhezeit → Job auf nächste erlaubte Zeit verschieben statt senden.
  // Aber nie hinter den Termin: dann lieber jetzt mit Bypass senden.
  if (isQuietHours(TIMEZONE)) {
    const next = nextAllowedTime(new Date(), TIMEZONE);
    if (next.getTime() < new Date(ctx.event.start_time).getTime() - 60 * 60 * 1000) {
      await svc
        .from('scheduled_jobs')
        .update({ run_at: next.toISOString(), status: 'pending', updated_at: new Date().toISOString() })
        .eq('agency_id', agencyId)
        .filter('dedupe_key', 'eq', `sales.confirmation:${payload.calendly_event_id}`);
      return;
    }
  }

  const { vorname, uhrzeit } = formatVars(ctx.candidate.name, ctx.event.start_time);
  const tag = relativeDay(ctx.event.start_time, new Date());
  const presetKey = payload.chain === 'setting' ? 'setting_bestaetigung' : 'beratung_bestaetigung';

  // {{1}} vorname, {{2}} heute/morgen/Datum, {{3}} uhrzeit + Quick-Reply-Button (kein Param)
  await sendSalesTemplate(svc, agencyId, ctx, presetKey, {
    bodyParams: [vorname, tag, uhrzeit],
    bypassQuietHours: true,
  });
}

// ---------------------------------------------------------------------------
// sales.reminder — kurz vor dem Termin (immer senden, zeitkritisch)
// ---------------------------------------------------------------------------

export async function processSalesReminder(
  svc: SupabaseClient,
  agencyId: string,
  payload: SalesJobPayload,
): Promise<void> {
  const ctx = await loadContext(svc, agencyId, payload.calendly_event_id);
  if (!ctx) return;

  const { vorname, uhrzeit } = formatVars(ctx.candidate.name, ctx.event.start_time);

  if (payload.chain === 'setting') {
    // setting_reminder_15min: {{1}} vorname, keine Buttons
    await sendSalesTemplate(svc, agencyId, ctx, 'setting_reminder_15min', {
      bodyParams: [vorname],
      bypassQuietHours: true,
    });
  } else {
    // beratung_reminder_1h: {{1}} vorname, {{2}} uhrzeit + Zoom-Button
    await sendSalesTemplate(svc, agencyId, ctx, 'beratung_reminder_1h', {
      bodyParams: [vorname, uhrzeit],
      urlButtonParam: payload.calendly_event_id,
      bypassQuietHours: true,
    });
  }
}

// ---------------------------------------------------------------------------
// sales.noshow_check — nach Terminende: nur Notification, kein Auto-Versand
// ---------------------------------------------------------------------------

export async function processSalesNoShowCheck(
  svc: SupabaseClient,
  agencyId: string,
  payload: SalesJobPayload,
): Promise<void> {
  const ctx = await loadContext(svc, agencyId, payload.calendly_event_id);
  if (!ctx) return;

  const label = payload.chain === 'setting' ? 'Erstgespräch' : 'Beratungsgespräch';
  await createNotificationForInternals(svc, {
    agency_id: agencyId,
    title: `Sales: ${label} nachfassen`,
    body: `${ctx.candidate.name}: ${label} ist vorbei — hat es stattgefunden? Bei No-Show zuerst anrufen, dann noshow_1_anruf senden.`,
    type: 'noshow',
    push_url: `/inbox?conversation=${ctx.conversation.id}`,
  });

  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: ctx.candidate.id,
    action: `Sales No-Show-Check (${label})`,
    action_type: 'other',
    metadata: { kind: 'sales_noshow_check', calendly_event_id: ctx.event.id, chain: payload.chain },
  });
}
