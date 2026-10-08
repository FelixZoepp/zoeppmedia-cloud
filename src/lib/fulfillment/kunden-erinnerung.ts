/**
 * Kunden an offene Aufgaben erinnern (Sales-WhatsApp-Vorlage + Glocke), sobald die Frist abgelaufen ist.
 * Höchstens alle 2 Tage und max. 3-mal je Schritt – danach landet der Kunde im Cockpit („anrufen“).
 * Schalter: system_einstellungen.kunden_erinnerungen_aktiv = 'true'
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { STEP_BY_KEY } from './catalog';
import { today } from './views';
import { SALES_AGENCY_ID, SALES_WA_ACCOUNT_ID } from '@/lib/sales/calendly-chain';

export const ERINNERUNG_AKTIV_KEY = 'kunden_erinnerungen_aktiv';
export const MAX_ERINNERUNGEN = 3;
const ABSTAND_TAGE = 2;

export interface OffeneKundenAufgabe {
  id: string;
  agency_id: string;
  step_key: string;
  status: string;
  faellig_am: string | null;
  kunde_erinnert_am: string | null;
  kunde_erinnerungen: number;
}

/** Rein, testbar: je Kunde die überfälligen Aufgaben, wenn mindestens eine wieder erinnert werden darf */
export function faelligeErinnerungen(rows: OffeneKundenAufgabe[], heute: string, jetzt: Date): Map<string, OffeneKundenAufgabe[]> {
  const grenze = jetzt.getTime() - ABSTAND_TAGE * 864e5 + 3600e3; // 1 h Puffer für die Cron-Uhrzeit
  const proKunde = new Map<string, OffeneKundenAufgabe[]>();
  for (const r of rows) {
    const def = STEP_BY_KEY.get(r.step_key);
    if (!def || def.wer !== 'kunde' || def.optional || r.step_key === 's_freigabe') continue;
    if (!['offen', 'in_arbeit'].includes(r.status) || !r.faellig_am || r.faellig_am >= heute) continue;
    proKunde.set(r.agency_id, [...(proKunde.get(r.agency_id) ?? []), r]);
  }
  for (const [id, liste] of proKunde) {
    const darf = liste.some((r) => r.kunde_erinnerungen < MAX_ERINNERUNGEN && (!r.kunde_erinnert_am || new Date(r.kunde_erinnert_am).getTime() <= grenze));
    if (!darf) proKunde.delete(id);
  }
  return proKunde;
}

/** Wie die offenen Punkte in der WhatsApp-Vorlage heißen („Damit es weitergeht, fehlt uns noch …“) */
const IN_SATZ: Record<string, string> = {
  o_kickoff_gebucht: 'ein Termin fürs Kick-off-Meeting',
  o_cloud_login: 'dein erster Login in der Zoepp Cloud',
  o_inhaltsfunnel: 'das ausgefüllte Onboarding-Formular',
  o_bilder: 'deine Bilder fürs Branding',
  o_meta_seite: 'der Zugriff auf deine Facebook-Seite',
  o_meta_instagram: 'der Zugriff auf dein Instagram-Konto',
  o_meta_werbekonto: 'der Zugriff auf dein Werbekonto',
  o_meta_pixel: 'der Zugriff auf dein Pixel',
  o_meta_domain: 'die Domain-Bestätigung bei Facebook',
  o_meta_zahlung: 'eine Zahlungsmethode im Werbekonto',
  o_indeed: 'der Indeed-Zugang',
};

/** „A, B und C“ – ab 4 Punkten: „A, B, C und 2 weitere Punkte“ */
export function aufgabenImSatz(keys: string[]): string {
  const t = keys.map((k) => IN_SATZ[k] ?? STEP_BY_KEY.get(k)?.titel ?? k);
  const teile = t.length > 4 ? [...t.slice(0, 3), `${t.length - 3} weitere Punkte`] : t;
  return teile.length > 1 ? `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]}` : teile[0] ?? '';
}

export async function erinnerungenAktiv(svc: SupabaseClient): Promise<boolean> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', ERINNERUNG_AKTIV_KEY).maybeSingle();
  return (data as { wert: string } | null)?.wert === 'true';
}

export interface ErinnerungsErgebnis {
  agency_id: string;
  name: string;
  aufgaben: string[];
  nummer: string | null;
  text: string;
  ergebnis: 'gesendet' | 'trocken' | 'keine_nummer' | 'vorlage_fehlt' | 'fehler';
  fehler?: string;
}

/** Täglich: per Sales-WhatsApp (Vorlage kunde_aufgaben_erinnerung) erinnern – E-Mails liest kaum jemand. */
export async function erinnereKunden(
  svc: SupabaseClient,
  opts: { jetzt?: Date; nurId?: string; trocken?: boolean } = {},
): Promise<ErinnerungsErgebnis[]> {
  const jetzt = opts.jetzt ?? new Date();
  const { data: ags } = await svc
    .from('agencies')
    .select('id, name, email, phone, contact_name, fulfillment_phase, pausiert_grund')
    .in('fulfillment_phase', ['onboarding', 'setup', 'continuity']);
  const kunden = ((ags ?? []) as Array<{ id: string; name: string; email: string | null; phone: string | null; contact_name: string | null; pausiert_grund: string | null }>).filter(
    (a) => !a.pausiert_grund && (!opts.nurId || a.id === opts.nurId),
  );
  if (!kunden.length) return [];
  const { data: rows } = await svc
    .from('client_steps')
    .select('id, agency_id, step_key, status, faellig_am, kunde_erinnert_am, kunde_erinnerungen')
    .in('agency_id', kunden.map((k) => k.id))
    .eq('wer', 'kunde')
    .in('phase', ['onboarding', 'setup'])
    .in('status', ['offen', 'in_arbeit']);
  const faellig = faelligeErinnerungen((rows ?? []) as OffeneKundenAufgabe[], today(jetzt), jetzt);
  if (!faellig.size) return [];

  const { kundenNummer, kundenKontakt } = await import('./kunden-kontakt');
  const { data: vorlage } = await svc
    .from('whatsapp_templates')
    .select('id, name')
    .eq('wa_account_id', SALES_WA_ACCOUNT_ID)
    .eq('preset_key', 'kunde_aufgaben_erinnerung')
    .eq('status', 'approved')
    .maybeSingle();
  const tmpl = vorlage as { id: string; name: string } | null;
  const out: ErinnerungsErgebnis[] = [];

  for (const [agencyId, liste] of faellig) {
    const k = kunden.find((x) => x.id === agencyId)!;
    const keys = liste.map((r) => r.step_key);
    const vorname = (k.contact_name ?? '').split(' ')[0] || 'zusammen';
    const satz = aufgabenImSatz(keys);
    const text = `Hallo ${vorname}, kurzes Update zu deinem Projekt mit Zoepp Media: Damit es weitergeht, fehlt uns noch ${satz}.`;
    const basis = { agency_id: agencyId, name: k.name, aufgaben: keys.map((x) => STEP_BY_KEY.get(x)?.titel ?? x), text };
    const nummer = await kundenNummer(svc, k, !opts.trocken).catch(() => null);
    if (opts.trocken) {
      out.push({ ...basis, nummer, ergebnis: !nummer ? 'keine_nummer' : tmpl ? 'trocken' : 'vorlage_fehlt' });
      continue;
    }

    if (!nummer) {
      out.push({ ...basis, nummer: null, ergebnis: 'keine_nummer' });
      continue;
    }
    if (!tmpl) {
      out.push({ ...basis, nummer, ergebnis: 'vorlage_fehlt' });
      continue;
    }
    {
      try {
        const kontaktId = await kundenKontakt(svc, k, nummer);
        if (!kontaktId) throw new Error('WhatsApp-Kontakt konnte nicht angelegt werden');
        await svc
          .from('conversations')
          .upsert(
            { agency_id: SALES_AGENCY_ID, candidate_id: kontaktId, wa_account_id: SALES_WA_ACCOUNT_ID, state: 'human_active' },
            { onConflict: 'wa_account_id,candidate_id', ignoreDuplicates: true },
          );
        const { data: conv } = await svc.from('conversations').select('id').eq('wa_account_id', SALES_WA_ACCOUNT_ID).eq('candidate_id', kontaktId).single();
        const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
        await sendWhatsAppMessage(svc, {
          agencyId: SALES_AGENCY_ID,
          conversationId: (conv as { id: string }).id,
          candidatePhone: nummer,
          waAccountId: SALES_WA_ACCOUNT_ID,
          payload: {
            to: nummer,
            type: 'template',
            template: { name: tmpl.name, language: { code: 'de' }, components: [{ type: 'body', parameters: [vorname, satz].map((t) => ({ type: 'text', text: t })) }] },
          },
          senderType: 'system',
          templateId: tmpl.id,
        });
        out.push({ ...basis, nummer, ergebnis: 'gesendet' });
      } catch (err) {
        out.push({ ...basis, nummer, ergebnis: 'fehler', fehler: err instanceof Error ? err.message : String(err) });
      }
    }

    // Zusätzlich die Glocke in der Cloud
    const { data: os } = await svc.from('users').select('id').eq('agency_id', agencyId).eq('role', 'agency_owner');
    const { createNotification } = await import('@/lib/notifications/create');
    for (const u of (os ?? []) as Array<{ id: string }>) {
      await createNotification(svc, {
        user_id: u.id,
        agency_id: agencyId,
        title: keys.length === 1 ? `Offen: ${basis.aufgaben[0]}` : `${keys.length} Aufgaben offen`,
        body: 'Mit einer kurzen Anleitung in „Deine Aufgaben“.',
        type: 'task_due',
        push_url: '/deine-aufgaben',
      }).catch(() => {});
    }

    // Auch bei Sendefehler vermerken – sonst kommt die Glocke jeden Tag erneut
    // und der Höchstwert von MAX_ERINNERUNGEN greift nie.
    for (const r of liste) {
      const { error } = await svc
        .from('client_steps')
        .update({ kunde_erinnert_am: jetzt.toISOString(), kunde_erinnerungen: r.kunde_erinnerungen + 1 })
        .eq('id', r.id);
      if (error) console.error('[kunden-erinnerung] Vermerk nicht gespeichert', r.id, error.message);
    }
  }
  return out;
}
