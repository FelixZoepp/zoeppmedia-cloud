/**
 * WhatsApp-Kette „Eingetragen, aber kein Termin“ (Funnel-Leads):
 *   1) 15 Min. nach der Eintragung: Erinnerung „Ein Schritt fehlt noch“ + Button „Termin buchen“
 *   2) Am nächsten Tag: Fallstudie B&C (Damian-Video + Rechnung, was das Warten gekostet hat) + „Termin buchen“
 *   3) An Tag 3: letzter Anstoß + „Termin buchen“ / „Gerade kein Thema“
 * Start: Job sales.eintragung_check stellt nach 10 Min. „nicht gebucht“ fest (nur Funnel-Leads, nur neue Eintragungen).
 * Stopp vor jedem Versand: Termin gebucht, aktive Opportunity in Close (z. B. telefonisch gelegt),
 * Antwort des Leads, STOP (whatsapp_opt_in = false). Ruhezeiten 20:30–8:00 Uhr → verschoben auf 8:30 Uhr.
 * Nicht freigegebene Vorlagen werden übersprungen.
 * Freigabe „eintrag_personalisiert“: Schritt 1 als eintrag_1_termin_v2 mit der Funnel-Angabe („3 bis 5 Vertriebler pro Monat“).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { logActivity } from '@/lib/activity/log';
import { ensureSalesProspect, normalizeToE164, SALES_AGENCY_ID, SALES_WA_ACCOUNT_ID } from './calendly-chain';
import { buildClickToken } from './tracking';
import { findeBuchung } from './eintragungen';

const CLOSE_BASE = 'https://api.close.com/api/v1';
const MIN = 60_000;

export const KETTE: Array<{ schritt: 1 | 2 | 3; vorlage: string; nachMin: number; buttonIndex: string }> = [
  { schritt: 1, vorlage: 'eintrag_1_termin', nachMin: 15, buttonIndex: '0' },
  { schritt: 2, vorlage: 'eintrag_2_fallstudie', nachMin: 24 * 60, buttonIndex: '1' },
  { schritt: 3, vorlage: 'eintrag_3_letzte', nachMin: 3 * 24 * 60, buttonIndex: '0' },
];

function berlinZeit(d: Date): { h: number; min: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { h: Number(p.hour), min: Number(p.minute) };
}

/** Versandzeit außerhalb der Ruhezeit (8:00–20:30 Berlin); sonst auf 8:30 Uhr schieben (rein, testbar) */
export function versandZeit(geplant: Date): Date {
  const { h, min } = berlinZeit(geplant);
  const m = h * 60 + min;
  if (m >= 8 * 60 && m < 20 * 60 + 30) return geplant;
  // Minuten bis 8:30 Uhr (heute früh oder morgen früh)
  const bis = m < 8 * 60 ? 8 * 60 + 30 - m : 24 * 60 - m + 8 * 60 + 30;
  return new Date(geplant.getTime() + bis * MIN);
}

export function schrittZeit(eingetragen: Date, schritt: 1 | 2 | 3, jetzt: Date): Date {
  const k = KETTE[schritt - 1];
  return versandZeit(new Date(Math.max(jetzt.getTime(), eingetragen.getTime() + k.nachMin * MIN)));
}

export async function planeSchritt(svc: SupabaseClient, leadId: string, schritt: 1 | 2 | 3, eingetragen: Date, jetzt: Date = new Date()): Promise<void> {
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.eintrag_kette',
    run_at: schrittZeit(eingetragen, schritt, jetzt).toISOString(),
    payload: { lead_id: leadId, schritt },
    status: 'pending',
    dedupe_key: `sales.eintrag_kette:${leadId}:${schritt}`,
  });
  if (error && error.code !== '23505') throw new Error(`Eintrag-Kette nicht geplant: ${error.message}`);
}

async function hatAktiveOpportunity(leadId: string): Promise<boolean> {
  const key = process.env.CLOSE_API_KEY;
  if (!key) return false;
  const res = await fetch(`${CLOSE_BASE}/opportunity/?lead_id=${leadId}&status_type=active&_fields=id`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Close-Opportunities nicht lesbar (${res.status})`);
  return ((await res.json()) as { data: unknown[] }).data.length > 0;
}

/** Funnel-Antwort „Wie viele Vertriebler möchtest du pro Monat onboarden?“ aus der Eintragungs-Notiz (rein, testbar) */
export function onboardingZiel(notiz: string): string | null {
  const m = notiz.match(/pro Monat onboarden\?:\s*([^\n]+?)(?=\s+(?:Was|Wor|Wie|Dein|Ich)\s|\n|$)/);
  const wert = m?.[1]?.trim();
  if (!wert || !/\d/.test(wert) || wert.length > 40) return null;
  return /vertriebler/i.test(wert) ? wert : `${wert} Vertriebler`;
}

async function funnelZiel(leadId: string): Promise<string | null> {
  const key = process.env.CLOSE_API_KEY;
  if (!key) return null;
  const res = await fetch(`${CLOSE_BASE}/activity/note/?lead_id=${leadId}&_fields=note`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const { data } = (await res.json()) as { data: Array<{ note?: string }> };
  for (const n of data) {
    const ziel = n.note ? onboardingZiel(n.note) : null;
    if (ziel) return ziel;
  }
  return null;
}

export type KettenErgebnis = 'gesendet' | 'gebucht' | 'opportunity' | 'geantwortet' | 'abgemeldet' | 'keine_nummer' | 'vorlage_fehlt' | 'unbekannt' | 'verschoben';

/** Job sales.eintrag_kette */
export async function verarbeiteEintragKette(svc: SupabaseClient, payload: { lead_id: string; schritt: 1 | 2 | 3 }, jetzt: Date = new Date()): Promise<KettenErgebnis> {
  const { data } = await svc.from('sales_eintragungen').select('lead_id, name, email, phone, eingetragen_am, gebucht_am, ergebnis').eq('lead_id', payload.lead_id).maybeSingle();
  const e = data as { lead_id: string; name: string | null; email: string | null; phone: string | null; eingetragen_am: string; gebucht_am: string | null; ergebnis: string | null } | null;
  if (!e || e.ergebnis === 'manuell') return 'unbekannt';
  const eingetragen = new Date(e.eingetragen_am);
  const weiter = async () => {
    if (payload.schritt < 3) await planeSchritt(svc, e.lead_id, (payload.schritt + 1) as 2 | 3, eingetragen, jetzt);
  };

  // Ruhezeit (z. B. Job lief verspätet) → auf 8:30 Uhr verschieben
  if (versandZeit(jetzt).getTime() !== jetzt.getTime()) {
    await svc.from('scheduled_jobs').insert({
      agency_id: SALES_AGENCY_ID,
      type: 'sales.eintrag_kette',
      run_at: versandZeit(jetzt).toISOString(),
      payload,
      status: 'pending',
      dedupe_key: `sales.eintrag_kette:${e.lead_id}:${payload.schritt}:${versandZeit(jetzt).toISOString().slice(0, 10)}`,
    });
    return 'verschoben';
  }

  if (e.gebucht_am || (await findeBuchung(svc, e))) return 'gebucht';
  if (await hatAktiveOpportunity(e.lead_id)) return 'opportunity';

  const nummer = normalizeToE164(e.phone);
  if (!nummer) return 'keine_nummer';

  // Bestehenden Kontakt nie wieder anmelden (STOP respektieren)
  const { data: vorhanden } = await svc.from('candidates').select('id, whatsapp_opt_in').eq('agency_id', SALES_AGENCY_ID).eq('phone_e164', nummer).is('deleted_at', null).limit(1).maybeSingle();
  const alt = vorhanden as { id: string; whatsapp_opt_in: boolean } | null;
  if (alt && !alt.whatsapp_opt_in) return 'abgemeldet';
  const prospectId = alt?.id ?? (await ensureSalesProspect(svc, nummer, e.name ?? 'Lead', e.email));
  if (!prospectId) return 'unbekannt';

  await svc.from('conversations').upsert(
    { agency_id: SALES_AGENCY_ID, candidate_id: prospectId, wa_account_id: SALES_WA_ACCOUNT_ID, state: 'human_active' },
    { onConflict: 'wa_account_id,candidate_id', ignoreDuplicates: true },
  );
  const { data: conv } = await svc.from('conversations').select('id').eq('wa_account_id', SALES_WA_ACCOUNT_ID).eq('candidate_id', prospectId).single();
  const conversationId = (conv as { id: string }).id;

  // Hat der Lead seit der Eintragung geantwortet? → ab hier übernimmt ein Mensch
  const { count: antworten } = await svc
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('direction', 'in')
    .gte('created_at', e.eingetragen_am);
  if (antworten) return 'geantwortet';

  const k = KETTE[payload.schritt - 1];
  // Schritt 1 personalisiert (Freigabe eintrag_personalisiert): Funnel-Angabe „pro Monat onboarden“ in der Nachricht
  let ziel: string | null = null;
  let vorlage = k.vorlage;
  if (payload.schritt === 1) {
    const { istFreigegeben } = await import('@/lib/freigaben');
    if (await istFreigegeben(svc, 'eintrag_personalisiert')) {
      ziel = await funnelZiel(e.lead_id).catch(() => null);
      if (ziel) vorlage = 'eintrag_1_termin_v2';
    }
  }
  const ladeVorlage = async (key: string) =>
    (await svc.from('whatsapp_templates').select('id, name').eq('wa_account_id', SALES_WA_ACCOUNT_ID).eq('preset_key', key).eq('status', 'approved').maybeSingle()).data as { id: string; name: string } | null;
  let tmpl = await ladeVorlage(vorlage);
  if (!tmpl && vorlage !== k.vorlage) {
    ziel = null;
    tmpl = await ladeVorlage(k.vorlage);
  }
  if (!tmpl) {
    await weiter();
    return 'vorlage_fehlt';
  }

  const vorname = (e.name ?? '').trim().split(/\s+/)[0] || 'zusammen';
  await sendWhatsAppMessage(svc, {
    agencyId: SALES_AGENCY_ID,
    conversationId,
    candidatePhone: nummer,
    waAccountId: SALES_WA_ACCOUNT_ID,
    payload: {
      to: nummer,
      type: 'template',
      template: {
        name: tmpl.name,
        language: { code: 'de' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: vorname }, ...(ziel ? [{ type: 'text', text: ziel }] : [])] },
          { type: 'button', sub_type: 'url', index: k.buttonIndex, parameters: [{ type: 'text', text: buildClickToken(prospectId, 'setting', `eintrag_${k.schritt}`) }] },
        ],
      },
    },
    senderType: 'system',
    templateId: tmpl.id,
  });
  await logActivity(svc, {
    agency_id: SALES_AGENCY_ID,
    candidate_id: prospectId,
    action: `Eintrag ohne Termin – Nachricht ${k.schritt}/3 gesendet (${tmpl.name})`,
    action_type: 'other',
    metadata: { kind: 'sales_eintrag_kette', lead_id: e.lead_id, schritt: k.schritt },
  }).catch(() => {});
  await weiter();
  return 'gesendet';
}
