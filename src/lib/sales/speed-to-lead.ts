/**
 * Speed-to-Lead-Alarm: Eine neue Eintragung ohne Termin muss angerufen werden.
 * Nach 10 Min. ohne Buchung gibt es schon „Jetzt anrufen“ (Close-Aufgabe + Push, eintragungen.ts).
 * 30 Min. nach der Eintragung prüft Job sales.anruf_check, ob in Close wirklich angerufen wurde:
 *   - Anruf, aktive Opportunity oder Termin gebucht → nichts
 *   - sonst → Push + Slack #03-sales und WhatsApp an die Geschäftsführung (Nummern aus system_einstellungen.ceo_briefing)
 * Nachts (20:30–8:00) wird auf 8:30 Uhr verschoben. Schalter unter /admin/freigaben („speed_alarm“).
 * Rein intern – an den Lead geht nichts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { istAusgeschlosseneQuelle } from './leadquelle';
import { SALES_AGENCY_ID, SALES_WA_ACCOUNT_ID } from './calendly-chain';
import { versandZeit } from './eintrag-kette';
import { findeBuchung } from './eintragungen';
import { notifySales } from './notify';
import { istFreigegeben } from '@/lib/freigaben';

export const ALARM_NACH_MIN = 30;

function headers(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}` };
}

async function close<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.close.com/api/v1${path}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${path.split('?')[0]}`);
  return res.json() as Promise<T>;
}

/** Prüfzeitpunkt: 30 Min. nach der Eintragung, nicht in der Nacht (rein, testbar) */
export function pruefZeit(eingetragen: Date, jetzt: Date): Date {
  return versandZeit(new Date(Math.max(jetzt.getTime(), eingetragen.getTime() + ALARM_NACH_MIN * 60_000)));
}

export async function planeAnrufCheck(svc: SupabaseClient, leadId: string, eingetragen: Date, jetzt: Date = new Date()): Promise<void> {
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.anruf_check',
    run_at: pruefZeit(eingetragen, jetzt).toISOString(),
    payload: { lead_id: leadId },
    status: 'pending',
    dedupe_key: `sales.anruf_check:${leadId}`,
  });
  if (error && error.code !== '23505') throw new Error(`Anruf-Check nicht geplant: ${error.message}`);
}

/** Wurde der Lead seit der Eintragung angerufen oder ist er schon weiter (Opportunity)? */
async function schonBearbeitet(leadId: string, seit: string): Promise<string | null> {
  const anrufe = await close<{ data: unknown[] }>(`/activity/call/?lead_id=${leadId}&date_created__gte=${encodeURIComponent(seit)}&_fields=id&_limit=1`);
  if (anrufe.data.length) return 'angerufen';
  const opps = await close<{ data: unknown[] }>(`/opportunity/?lead_id=${leadId}&date_created__gte=${encodeURIComponent(seit)}&_fields=id&_limit=1`);
  if (opps.data.length) return 'opportunity';
  return null;
}

/** WhatsApp an die Geschäftsführung: Vorlage sales_alarm, solange sie nicht freigegeben ist Freitext (nur im 24-h-Fenster) */
export async function sendeAlarmWhatsApp(svc: SupabaseClient, titel: string, details: string): Promise<string[]> {
  const { data: e } = await svc.from('system_einstellungen').select('wert').eq('key', 'ceo_briefing').maybeSingle();
  let nummern: string[] = [];
  try {
    const w = (e as { wert: unknown } | null)?.wert;
    nummern = ((typeof w === 'string' ? JSON.parse(w) : w) as { whatsapp?: string[] } | null)?.whatsapp ?? [];
  } catch {
    /* keine Nummern */
  }
  if (!nummern.length) return [];
  const { getProvider } = await import('@/lib/whatsapp/provider');
  const { decryptSecret } = await import('@/lib/crypto');
  const { data: acc } = await svc.from('whatsapp_accounts').select('access_token_enc, phone_number_id').eq('id', SALES_WA_ACCOUNT_ID).single();
  const a = acc as { access_token_enc: string; phone_number_id: string } | null;
  if (!a) return ['Sales-WhatsApp-Konto fehlt'];
  const token = decryptSecret(a.access_token_enc);
  const { data: v } = await svc.from('whatsapp_templates').select('name').eq('wa_account_id', SALES_WA_ACCOUNT_ID).eq('preset_key', 'sales_alarm').eq('status', 'approved').maybeSingle();
  // WhatsApp-Parameter dürfen keine Zeilenumbrüche enthalten
  const einzeilig = (t: string) => t.replace(/\s*\n+\s*/g, ' · ').slice(0, 900);
  const wege: string[] = [];
  for (const to of nummern) {
    try {
      if (v) {
        await getProvider().sendMessage(a.phone_number_id, token, {
          to,
          type: 'template',
          template: { name: (v as { name: string }).name, language: { code: 'de' }, components: [{ type: 'body', parameters: [einzeilig(titel), einzeilig(details)].map((text) => ({ type: 'text', text })) }] },
        });
        wege.push('vorlage');
      } else {
        await getProvider().sendMessage(a.phone_number_id, token, { to, type: 'text', text: { body: `⚠️ Sales-Alarm: ${titel}\n\n${details}` } });
        wege.push('text');
      }
    } catch (err) {
      wege.push(`fehler: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return wege;
}

/** Job sales.anruf_check */
export async function pruefeAnruf(svc: SupabaseClient, payload: { lead_id: string }, jetzt: Date = new Date()): Promise<string> {
  if (!(await istFreigegeben(svc, 'speed_alarm'))) return 'aus';
  // Job lief verspätet in die Nacht → auf 8:30 Uhr verschieben
  if (versandZeit(jetzt).getTime() !== jetzt.getTime()) {
    await svc.from('scheduled_jobs').insert({
      agency_id: SALES_AGENCY_ID,
      type: 'sales.anruf_check',
      run_at: versandZeit(jetzt).toISOString(),
      payload,
      status: 'pending',
      dedupe_key: `sales.anruf_check:${payload.lead_id}:${versandZeit(jetzt).toISOString().slice(0, 10)}`,
    });
    return 'verschoben';
  }
  const { data } = await svc.from('sales_eintragungen').select('lead_id, name, email, phone, quelle, eingetragen_am, gebucht_am, ergebnis').eq('lead_id', payload.lead_id).maybeSingle();
  const e = data as { lead_id: string; name: string | null; email: string | null; phone: string | null; quelle: string | null; eingetragen_am: string; gebucht_am: string | null; ergebnis: string | null } | null;
  if (!e || e.ergebnis === 'manuell' || istAusgeschlosseneQuelle(e.quelle)) return 'unbekannt';
  if (e.gebucht_am || (await findeBuchung(svc, e))) return 'gebucht';
  const grund = await schonBearbeitet(e.lead_id, e.eingetragen_am);
  if (grund) return grund;

  const um = new Date(e.eingetragen_am).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  const minuten = Math.round((jetzt.getTime() - new Date(e.eingetragen_am).getTime()) / 60_000);
  const seit = minuten >= 120 ? `${Math.round(minuten / 60)} Std.` : `${minuten} Min.`;
  const titel = `${e.name ?? 'Neue Eintragung'} seit ${seit} nicht angerufen`;
  const details = `Eingetragen um ${um} Uhr${e.quelle ? ` (${e.quelle})` : ''}${e.phone ? ` – Telefon ${e.phone}` : ''}. Kein Anruf in Close, kein Termin.`;
  await notifySales(svc, { emoji: '🚨', title: titel, body: `${details} Jede Minute senkt die Abschlusschance.`, type: 'task_due', phone: e.phone });
  const wege = await sendeAlarmWhatsApp(svc, titel, details);
  await svc.from('sales_eintragungen').update({ alarm_am: jetzt.toISOString() }).eq('lead_id', e.lead_id);
  return `alarm (${wege.join(', ') || 'ohne WhatsApp'})`;
}
