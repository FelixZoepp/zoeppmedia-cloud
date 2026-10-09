/**
 * Aufgaben per WhatsApp: Ein interner Nutzer (Nummer in users.phone) schickt der Zoepp-Nummer eine
 * Sprachnachricht (oder Text mit „Aufgabe:“ / „To-do:“) → Aufgaben werden direkt angelegt, die Zuständigen
 * bekommen Push + Glocke, der Absender eine Zusammenfassung zurück.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getProvider } from '@/lib/whatsapp/provider';
import { decryptSecret } from '@/lib/crypto';
import { SALES_AGENCY_ID, SALES_WA_ACCOUNT_ID } from '@/lib/sales/calendly-chain';
import { ladeTeam } from './boards';
import { erkenneAufgaben, legeVorschlaegeAn } from './diktat';

const letzte9 = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').slice(-9);

/** Interner Nutzer zu einer WhatsApp-Nummer (letzte 9 Ziffern) */
export async function internerNutzerZuNummer(svc: SupabaseClient, phone: string): Promise<{ id: string; name: string } | null> {
  const ziel = letzte9(phone);
  if (ziel.length < 9) return null;
  const { data } = await svc.from('users').select('id, name, phone, aktiv').in('role', ['admin', 'employee']).not('phone', 'is', null);
  const u = ((data ?? []) as Array<{ id: string; name: string; phone: string | null; aktiv: boolean | null }>).find((x) => x.aktiv !== false && letzte9(x.phone) === ziel);
  return u ? { id: u.id, name: u.name } : null;
}

/** Text-Diktat erkennen: „Aufgabe: …“, „To-do: …“, „Todo …“ */
export function istTextDiktat(text: string | undefined): string | null {
  const m = /^\s*(aufgaben?|to-?dos?)\s*[:\-–]\s*([\s\S]+)$/i.exec(text ?? '');
  return m ? m[2].trim() : null;
}

export interface DiktatJob {
  user_id: string;
  phone: string;
  media_id?: string;
  text?: string;
}

async function zugang(svc: SupabaseClient) {
  const { data } = await svc.from('whatsapp_accounts').select('access_token_enc, phone_number_id').eq('id', SALES_WA_ACCOUNT_ID).eq('agency_id', SALES_AGENCY_ID).single();
  const a = data as { access_token_enc: string; phone_number_id: string } | null;
  if (!a) throw new Error('Sales-WhatsApp-Konto nicht gefunden');
  return { token: decryptSecret(a.access_token_enc), phoneNumberId: a.phone_number_id };
}

async function antworte(svc: SupabaseClient, to: string, body: string) {
  const { token, phoneNumberId } = await zugang(svc);
  await getProvider().sendMessage(phoneNumberId, token, { to, type: 'text', text: { body } });
}

/** Job aufgaben.whatsapp_diktat */
export async function verarbeiteWhatsAppDiktat(svc: SupabaseClient, job: DiktatJob): Promise<void> {
  const { data: u } = await svc.from('users').select('id, name').eq('id', job.user_id).single();
  const von = u as { id: string; name: string };
  let text = job.text ?? '';
  if (!text && job.media_id) {
    const { token } = await zugang(svc);
    const url = await getProvider().getMediaUrl(job.media_id, token);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Sprachnachricht nicht ladbar (${res.status})`);
    const { transcribeAudio } = await import('@/lib/recordings/transcribe');
    text = (await transcribeAudio(Buffer.from(await res.arrayBuffer()), 'diktat.ogg')).trim();
  }
  if (!text) {
    await antworte(svc, job.phone, 'Ich habe die Nachricht leider nicht verstanden – schick sie bitte nochmal.');
    return;
  }
  const team = await ladeTeam(svc);
  const erg = await erkenneAufgaben(text, team, von);
  const angelegt = erg.aufgaben.length ? await legeVorschlaegeAn(svc, erg.aufgaben, von, 'whatsapp') : [];
  await svc.from('aufgaben_sprachnachrichten').insert({ user_id: von.id, quelle: 'whatsapp', transkript: text, ergebnis: { ...erg, angelegt } });

  const name = (id: string | null) => team.find((t) => t.id === id)?.name.split(' ')[0] ?? '–';
  const zeilen = angelegt.map((a) => `• ${a.titel} → ${name(a.zustaendig)}${a.art === 'serie' ? ' (wiederkehrend)' : ''}`);
  const antwort = angelegt.length
    ? `✅ ${angelegt.length === 1 ? '1 Aufgabe angelegt' : `${angelegt.length} Aufgaben angelegt`}:\n${zeilen.join('\n')}${erg.rueckfrage ? `\n\n❓ ${erg.rueckfrage}` : ''}\n\nhttps://cloud.zoeppmedia.de/boards`
    : `Ich habe keine Aufgabe erkannt.${erg.rueckfrage ? ` ${erg.rueckfrage}` : ''}`;
  // Antwort darf den Job nicht scheitern lassen – sonst würden die Aufgaben beim Wiederholen doppelt angelegt
  await antworte(svc, job.phone, antwort).catch((err) => console.error('[whatsapp-diktat] Antwort fehlgeschlagen', err));
}
