/**
 * Anruf-Modus „Nicht erreicht / Mailbox“ → WhatsApp an den Bewerber: „Wann erreichen wir dich am besten?“
 * Nur mit Freigabe „bewerber_nicht_erreicht_whatsapp“ und Bewerber-Kontakt-Schalter (sonst nur Testnummern).
 * Höchstens einmal in 3 Tagen, nicht nachts (Ruhezeit → später), nicht bei STOP/Sperre.
 * Ist das 24-h-Fenster offen (Bewerber hat zuletzt geschrieben), geht kostenloser Freitext raus, sonst die Vorlage.
 * Die Antwort landet im Posteingang; der KI-Agent erkennt Rückrufwünsche (Innendienst + Erinnerung).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { istFreigegeben } from '@/lib/freigaben';
import { logActivity } from '@/lib/activity/log';

const SPERRE_TAGE = 3;
export const ART = 'bewerber_nicht_erreicht_sent';

export type Ergebnis = 'gesendet' | 'freigabe_aus' | 'kein_bewerber' | 'gesperrt' | 'erreicht' | 'schon_gesendet' | 'kein_whatsapp' | 'vorlage_fehlt' | 'verschoben' | 'kontakt_gesperrt';

/** Freitext im offenen Fenster – gleicher Inhalt wie die Vorlage (rein, testbar) */
export function nachrichtText(vorname: string, firma: string): string {
  return `Hallo ${vorname}, wir haben gerade versucht, dich wegen deiner Bewerbung bei ${firma} anzurufen. Wann erreichen wir dich am besten? Schreib uns einfach Tag und Uhrzeit, dann rufen wir genau dann an.`;
}

export function vornameVon(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'du';
}

/** Nach dem Protokollieren „Nicht erreicht“: Versand in 2 Minuten planen (nur mit Freigabe) */
export async function planeBewerberNichtErreicht(svc: SupabaseClient, candidateId: string, agencyId: string, jetzt: Date = new Date()): Promise<boolean> {
  if (!(await istFreigegeben(svc, 'bewerber_nicht_erreicht_whatsapp'))) return false;
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: agencyId,
    type: 'bewerber.nicht_erreicht',
    run_at: new Date(jetzt.getTime() + 2 * 60_000).toISOString(),
    payload: { candidate_id: candidateId },
    status: 'pending',
    dedupe_key: `bewerber.nicht_erreicht:${candidateId}:${jetzt.toISOString().slice(0, 10)}`,
  });
  if (error && error.code !== '23505') throw new Error(`Nicht-erreicht-WhatsApp nicht geplant: ${error.message}`);
  return !error;
}

/** Job bewerber.nicht_erreicht */
export async function sendeBewerberNichtErreicht(svc: SupabaseClient, payload: { candidate_id: string }, jetzt: Date = new Date()): Promise<Ergebnis> {
  if (!(await istFreigegeben(svc, 'bewerber_nicht_erreicht_whatsapp'))) return 'freigabe_aus';

  const { data: c } = await svc
    .from('candidates')
    .select('id, agency_id, name, phone_e164, whatsapp_opt_in, blacklisted, do_not_contact, deleted_at')
    .eq('id', payload.candidate_id)
    .maybeSingle();
  const cand = c as { id: string; agency_id: string; name: string | null; phone_e164: string | null; whatsapp_opt_in: boolean | null; blacklisted: boolean | null; do_not_contact: boolean | null; deleted_at: string | null } | null;
  if (!cand || !cand.phone_e164) return 'kein_bewerber';
  if (cand.deleted_at || cand.blacklisted || cand.do_not_contact || cand.whatsapp_opt_in === false) return 'gesperrt';

  // Inzwischen doch erreicht? Dann nichts schicken
  const { data: letzter } = await svc.from('call_logs').select('result').eq('candidate_id', cand.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if ((letzter as { result: string } | null)?.result !== 'nicht_erreicht') return 'erreicht';

  // Höchstens einmal in 3 Tagen
  const { count } = await svc
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('candidate_id', cand.id)
    .eq('metadata->>kind', ART)
    .gte('created_at', new Date(jetzt.getTime() - SPERRE_TAGE * 864e5).toISOString());
  if (count) return 'schon_gesendet';

  // WhatsApp-Konto des Kunden + Gespräch (anlegen, falls es noch keins gibt)
  const { data: konto } = await svc.from('whatsapp_accounts').select('id').eq('agency_id', cand.agency_id).eq('status', 'connected').limit(1).maybeSingle();
  const waAccountId = (konto as { id: string } | null)?.id;
  if (!waAccountId) return 'kein_whatsapp';
  await svc
    .from('conversations')
    .upsert({ agency_id: cand.agency_id, candidate_id: cand.id, wa_account_id: waAccountId, state: 'waiting' }, { onConflict: 'wa_account_id,candidate_id', ignoreDuplicates: true });
  const { data: conv } = await svc.from('conversations').select('id, window_expires_at').eq('wa_account_id', waAccountId).eq('candidate_id', cand.id).single();
  const gespraech = conv as { id: string; window_expires_at: string | null };

  const { data: ag } = await svc.from('agencies').select('name').eq('id', cand.agency_id).maybeSingle();
  const firma = (ag as { name: string } | null)?.name ?? 'uns';
  const vorname = vornameVon(cand.name);
  const fensterOffen = !!gespraech.window_expires_at && new Date(gespraech.window_expires_at).getTime() > jetzt.getTime() + 60_000;

  let vorlageId: string | null = null;
  let vorlageName: string | null = null;
  if (!fensterOffen) {
    const { data: t } = await svc
      .from('whatsapp_templates')
      .select('id, name')
      .eq('wa_account_id', waAccountId)
      .eq('preset_key', 'bewerber_nicht_erreicht')
      .eq('status', 'approved')
      .maybeSingle();
    const tmpl = t as { id: string; name: string } | null;
    if (!tmpl) return 'vorlage_fehlt';
    vorlageId = tmpl.id;
    vorlageName = tmpl.name;
  }

  const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
  const { QuietHoursError } = await import('@/lib/whatsapp/window');
  const { KontaktGesperrtError } = await import('./kontakt-schalter');
  try {
    await sendWhatsAppMessage(svc, {
      agencyId: cand.agency_id,
      conversationId: gespraech.id,
      candidatePhone: cand.phone_e164,
      waAccountId,
      payload: vorlageName
        ? {
            to: cand.phone_e164,
            type: 'template',
            template: { name: vorlageName, language: { code: 'de' }, components: [{ type: 'body', parameters: [{ type: 'text', text: vorname }, { type: 'text', text: firma }] }] },
          }
        : { to: cand.phone_e164, type: 'text', text: { body: nachrichtText(vorname, firma) } },
      senderType: 'system',
      // Wie Anrufe: täglich 8–21 Uhr
      gespraechsZeiten: true,
      ...(vorlageId ? { templateId: vorlageId } : {}),
    });
  } catch (err) {
    if (err instanceof KontaktGesperrtError) return 'kontakt_gesperrt';
    if (err instanceof QuietHoursError) {
      // Ruhezeit → am nächsten erlaubten Zeitpunkt erneut
      const { nextAllowedTime } = await import('@/lib/whatsapp/window');
      const spaeter = err.naechsteZeit ?? nextAllowedTime(jetzt, 'Europe/Berlin');
      await svc.from('scheduled_jobs').insert({
        agency_id: cand.agency_id,
        type: 'bewerber.nicht_erreicht',
        run_at: spaeter.toISOString(),
        payload,
        status: 'pending',
        dedupe_key: `bewerber.nicht_erreicht:${cand.id}:verschoben:${spaeter.toISOString().slice(0, 10)}`,
      });
      return 'verschoben';
    }
    throw err;
  }

  await logActivity(svc, {
    agency_id: cand.agency_id,
    candidate_id: cand.id,
    action: 'Nicht erreicht – WhatsApp „Wann erreichen wir dich am besten?“ gesendet',
    action_type: 'other',
    metadata: { kind: ART, kostenlos: fensterOffen },
  });
  return 'gesendet';
}
