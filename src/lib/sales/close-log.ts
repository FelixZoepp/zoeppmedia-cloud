/**
 * Sales-Bot: jede WhatsApp-Nachricht der Sales-Nummer (ein- und ausgehend) als
 * WhatsApp-Aktivität am passenden Close-Lead ablegen. Läuft als Job über den Tick,
 * damit Versand/Empfang nie auf Close warten.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SendMessagePayload } from '@/lib/whatsapp/provider';
import { SALES_AGENCY_ID } from './calendly-chain';
import { findCloseContact, createCloseWhatsAppActivity } from './close';

/** Sales-Nummer 030 82684175 in E.164 */
export const SALES_PHONE_E164 = '+493082684175';

export interface SalesCloseLogPayload {
  direction: 'incoming' | 'outgoing';
  text: string;
  /** Nummer des Leads (E.164) */
  phone: string;
  waMessageId: string;
  at: string;
}

/** Text einer Vorlage mit den gesendeten Body-Parametern ({{1}}, {{2}} …) füllen. */
export function renderTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n) => params[Number(n) - 1] ?? m);
}

/** Lesbarer Text einer ausgehenden Nachricht — Vorlagen mit echtem Text statt Vorlagenname. */
export async function outgoingText(
  svc: SupabaseClient,
  payload: SendMessagePayload,
  templateId: string | null | undefined,
  agencyId?: string | null,
): Promise<string> {
  if (payload.text?.body) return payload.text.body;
  if (payload.type === 'template' && payload.template) {
    if (templateId || agencyId) {
      // Automationen senden oft nur mit Vorlagennamen – dann über Name + Agentur nachschlagen
      const q = svc.from('whatsapp_templates').select('body');
      const { data } = templateId
        ? await q.eq('id', templateId).maybeSingle()
        : await q.eq('agency_id', agencyId!).eq('name', payload.template.name).limit(1).maybeSingle();
      const body = (data as { body: string } | null)?.body;
      if (body) {
        const bodyComp = payload.template.components?.find((c) => c.type === 'body') as
          | { parameters?: Array<{ text?: string }> }
          | undefined;
        return renderTemplateBody(body, (bodyComp?.parameters ?? []).map((p) => p.text ?? ''));
      }
    }
    return `[Vorlage ${payload.template.name}]`;
  }
  return `[${payload.type}]`;
}

/** Job zum Ablegen in Close einplanen (dedupe über die WhatsApp-Message-ID). */
export async function enqueueSalesCloseLog(svc: SupabaseClient, p: SalesCloseLogPayload): Promise<void> {
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.close_log',
    run_at: new Date().toISOString(),
    payload: p,
    status: 'pending',
    dedupe_key: `sales.close_log:${p.waMessageId}`,
  });
  if (error && error.code !== '23505') throw new Error(`Close-Log konnte nicht geplant werden: ${error.message}`);
}

/** Job: Lead/Kontakt in Close suchen und die Nachricht dort ablegen. Kein Lead → still beenden. */
export async function processSalesCloseLog(p: SalesCloseLogPayload): Promise<'logged' | 'no_lead'> {
  const target = await findCloseContact({ phone: p.phone });
  if (!target) return 'no_lead';
  await createCloseWhatsAppActivity({
    ...target,
    direction: p.direction,
    externalId: p.waMessageId,
    text: p.text,
    localPhone: SALES_PHONE_E164,
    remotePhone: p.phone,
    at: p.at,
  });
  return 'logged';
}
