/**
 * Kunden an offene Aufgaben erinnern (E-Mail + Glocke), sobald die Frist abgelaufen ist.
 * Höchstens alle 2 Tage und max. 3-mal je Schritt – danach landet der Kunde im Cockpit („anrufen“).
 * Schalter: system_einstellungen.kunden_erinnerungen_aktiv = 'true'
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { STEP_BY_KEY } from './catalog';
import { today } from './views';

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

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function erinnerungsMail(name: string | null, titel: string[], url: string): { betreff: string; html: string } {
  const betreff = titel.length === 1 ? `Kurz noch: ${titel[0]}` : `Kurz noch ${titel.length} Dinge für deinen Kampagnenstart`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="padding:32px 40px 8px;"><h2 style="margin:0;font-size:18px;font-weight:700;color:#111;">Zoepp Media Cloud</h2></div>
    <div style="padding:8px 40px 32px;">
      <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 12px;">Hallo${name ? ` ${esc(name.split(' ')[0])}` : ''},</p>
      <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 12px;">damit wir deine Kampagne starten können, brauchen wir noch ${titel.length === 1 ? 'eine Sache' : 'ein paar Dinge'} von dir:</p>
      <ul style="font-size:15px;color:#111;line-height:1.7;margin:0 0 20px;padding-left:20px;">${titel.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 24px;">Zu jedem Punkt findest du in der Cloud eine kurze Anleitung. Dauert meist nur ein paar Minuten.</p>
      <a href="${url}" style="display:inline-block;padding:14px 28px;background:#B91C1C;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">Zu deinen Aufgaben</a>
      <p style="font-size:13px;color:#777;line-height:1.6;margin:24px 0 0;">Fragen? Antworte einfach in der Cloud unter „Hilfe“ – wir helfen gern.</p>
    </div>
  </div>
</body></html>`;
  return { betreff, html };
}

export async function erinnerungenAktiv(svc: SupabaseClient): Promise<boolean> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', ERINNERUNG_AKTIV_KEY).maybeSingle();
  return (data as { wert: string } | null)?.wert === 'true';
}

/** Täglich: Erinnerungen verschicken. Gibt die Anzahl erinnerter Kunden zurück. */
export async function erinnereKunden(
  svc: SupabaseClient,
  opts: { jetzt?: Date; nurId?: string; trocken?: boolean } = {},
): Promise<Array<{ agency_id: string; name: string; aufgaben: string[]; an: string[] }>> {
  const jetzt = opts.jetzt ?? new Date();
  const { data: ags } = await svc.from('agencies').select('id, name, email, contact_name, fulfillment_phase, pausiert_grund').in('fulfillment_phase', ['onboarding', 'setup']);
  const kunden = ((ags ?? []) as Array<{ id: string; name: string; email: string | null; contact_name: string | null; pausiert_grund: string | null }>).filter(
    (a) => !a.pausiert_grund && (!opts.nurId || a.id === opts.nurId),
  );
  if (!kunden.length) return [];
  const { data: rows } = await svc
    .from('client_steps')
    .select('id, agency_id, step_key, status, faellig_am, kunde_erinnert_am, kunde_erinnerungen')
    .in('agency_id', kunden.map((k) => k.id))
    .eq('wer', 'kunde')
    .in('status', ['offen', 'in_arbeit']);
  const faellig = faelligeErinnerungen((rows ?? []) as OffeneKundenAufgabe[], today(jetzt), jetzt);
  if (!faellig.size) return [];

  const { data: owners } = await svc.from('users').select('id, agency_id, email, name, aktiv').in('agency_id', [...faellig.keys()]).eq('role', 'agency_owner');
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://cloud.zoeppmedia.de'}/deine-aufgaben`;
  const { sendeWochenberichtEmail } = await import('@/lib/email/resend');
  const { createNotification } = await import('@/lib/notifications/create');
  const out: Array<{ agency_id: string; name: string; aufgaben: string[]; an: string[] }> = [];

  for (const [agencyId, liste] of faellig) {
    const k = kunden.find((x) => x.id === agencyId)!;
    const os = ((owners ?? []) as Array<{ id: string; agency_id: string; email: string | null; name: string | null; aktiv: boolean | null }>).filter(
      (u) => u.agency_id === agencyId && u.email && u.aktiv !== false,
    );
    const an = os.length ? os.map((u) => u.email!) : k.email ? [k.email] : [];
    if (!an.length) continue;
    const titel = liste.map((r) => STEP_BY_KEY.get(r.step_key)?.titel ?? r.step_key);
    out.push({ agency_id: agencyId, name: k.name, aufgaben: titel, an });
    if (opts.trocken) continue;

    const mail = erinnerungsMail(os[0]?.name ?? k.contact_name, titel, url);
    await sendeWochenberichtEmail(an, mail.betreff, mail.html);
    for (const u of os) {
      await createNotification(svc, {
        user_id: u.id,
        agency_id: agencyId,
        title: titel.length === 1 ? `Offen: ${titel[0]}` : `${titel.length} Aufgaben für deinen Start offen`,
        body: 'Mit einer kurzen Anleitung in „Deine Aufgaben“.',
        type: 'task_due',
        push_url: '/deine-aufgaben',
      }).catch(() => {});
    }
    for (const r of liste) {
      await svc
        .from('client_steps')
        .update({ kunde_erinnert_am: jetzt.toISOString(), kunde_erinnerungen: r.kunde_erinnerungen + 1 })
        .eq('id', r.id);
    }
  }
  return out;
}
