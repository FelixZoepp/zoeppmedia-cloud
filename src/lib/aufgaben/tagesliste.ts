/**
 * Morgens per WhatsApp „Deine Aufgaben heute“ (Mo–Fr, 7:30–10 Uhr Berlin):
 * Jeder interne Nutzer mit Handynummer bekommt seine überfälligen + heute fälligen Aufgaben als nummerierte Liste
 * (Vorlage team_aufgaben_heute). Die Liste wird je Tag gespeichert (aufgaben_tageslisten), damit eine Antwort
 * „erledigt 2“ bzw. „erledigt 1 3“ genau diese Aufgaben abhakt. Mit „liste“ kommt die aktuelle Liste zurück.
 * Ist die Vorlage (noch) nicht freigegeben, gibt es stattdessen Push + Glocke.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getProvider } from '@/lib/whatsapp/provider';
import { decryptSecret } from '@/lib/crypto';
import { normalizeToE164, SALES_AGENCY_ID, SALES_WA_ACCOUNT_ID } from '@/lib/sales/calendly-chain';
import { berlinTag } from '@/lib/zeit/berlin';
import { ladeTeam } from './boards';

export const MAX_LISTE = 10;

export interface ListenAufgabe {
  id: string;
  title: string;
  due_date: string | null;
  priority: string;
}

/** Text für einen Vorlagen-Parameter: keine Zeilenumbrüche/Tabs, keine 4+ Leerzeichen (Meta-Regel) */
export function einzeilig(t: string, max = 60): string {
  const s = t.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Überfällige zuerst, dann heute; innerhalb nach Priorität */
export function sortiere(liste: ListenAufgabe[]): ListenAufgabe[] {
  const prio: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  return [...liste].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || (prio[a.priority] ?? 9) - (prio[b.priority] ?? 9));
}

/** „1) Titel (überfällig) · 2) Titel“ – einzeilig für den Vorlagen-Parameter */
export function listenText(liste: ListenAufgabe[], heute: string, gesamt: number): string {
  const teile = liste.map((a, i) => `${i + 1}) ${einzeilig(a.title)}${a.due_date && a.due_date < heute ? ' (überfällig)' : ''}`);
  const rest = gesamt - liste.length;
  return `${teile.join(' · ')}${rest > 0 ? ` · und ${rest} weitere im Board` : ''}`;
}

/** „erledigt 2“, „erledigt 1, 3“, „Erledigt 1 und 4“, „done 2“ → [2] / [1,3] / [1,4]; sonst null */
export function leseErledigt(text: string): number[] | null {
  const m = /^\s*(erledigt|fertig|done|erl\.?)\s*[:\-]?\s*([\d\s,.;&+und]+)\s*[.!✅]*\s*$/i.exec(text);
  if (!m) return null;
  const nummern = [...new Set((m[2].match(/\d+/g) ?? []).map(Number).filter((n) => n >= 1 && n <= 50))];
  return nummern.length ? nummern : null;
}

export function istListenBefehl(text: string): boolean {
  return /^\s*(liste|aufgaben heute|meine aufgaben|heute)\s*[?!.]*\s*$/i.test(text);
}

function stundeMinute(jetzt: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(jetzt).map((x) => [x.type, x.value]));
  return { h: Number(p.hour), min: Number(p.minute), wt: p.weekday as string };
}

/** Tick: Mo–Fr zwischen 7:30 und 10 Uhr einmal planen (spätere Deploys verschicken nichts mehr am selben Tag) */
export async function planeTageslisten(svc: SupabaseClient, jetzt: Date = new Date()): Promise<void> {
  const { h, min, wt } = stundeMinute(jetzt);
  if (wt === 'Sat' || wt === 'Sun') return;
  const minuten = h * 60 + min;
  if (minuten < 7 * 60 + 30 || minuten >= 10 * 60) return;
  const tag = berlinTag(jetzt);
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'aufgaben.tagesliste',
    run_at: jetzt.toISOString(),
    payload: { tag },
    status: 'pending',
    dedupe_key: `aufgaben.tagesliste:${tag}`,
  });
  if (error && error.code !== '23505') console.error('[tagesliste] nicht geplant:', error.message);
}

async function zugang(svc: SupabaseClient) {
  const { data } = await svc.from('whatsapp_accounts').select('access_token_enc, phone_number_id').eq('id', SALES_WA_ACCOUNT_ID).eq('agency_id', SALES_AGENCY_ID).single();
  const a = data as { access_token_enc: string; phone_number_id: string } | null;
  if (!a) throw new Error('Sales-WhatsApp-Konto nicht gefunden');
  return { token: decryptSecret(a.access_token_enc), phoneNumberId: a.phone_number_id };
}

/** Offene Aufgaben einer Person, die heute fällig oder überfällig sind */
export async function faelligeAufgaben(svc: SupabaseClient, userId: string, heute: string): Promise<ListenAufgabe[]> {
  const { data } = await svc
    .from('internal_tasks')
    .select('id, title, due_date, priority')
    .eq('assigned_to', userId)
    .neq('status', 'done')
    .lte('due_date', heute)
    .limit(200);
  return sortiere((data ?? []) as ListenAufgabe[]);
}

/** Job aufgaben.tagesliste – je Person höchstens einmal pro Tag (Eintrag in aufgaben_tageslisten zuerst beanspruchen) */
export async function sendeTageslisten(svc: SupabaseClient, jetzt: Date = new Date()): Promise<{ gesendet: number; push: number; fehler: string[] }> {
  const heute = berlinTag(jetzt);
  const team = await ladeTeam(svc);
  const { data: vorlage } = await svc
    .from('whatsapp_templates')
    .select('id, name')
    .eq('wa_account_id', SALES_WA_ACCOUNT_ID)
    .eq('preset_key', 'team_aufgaben_heute')
    .eq('status', 'approved')
    .maybeSingle();
  const tmpl = vorlage as { id: string; name: string } | null;
  const z = tmpl ? await zugang(svc) : null;
  let gesendet = 0;
  let push = 0;
  const fehler: string[] = [];

  for (const u of team) {
    const nummer = normalizeToE164(u.phone);
    // Ohne Handynummer und ohne freigegebene Vorlage gibt es nichts zu senden
    const alle = await faelligeAufgaben(svc, u.id, heute);
    if (!alle.length) continue;
    const liste = alle.slice(0, MAX_LISTE);
    const { error: claimErr } = await svc.from('aufgaben_tageslisten').insert({ user_id: u.id, tag: heute, task_ids: liste.map((a) => a.id), gesendet_am: jetzt.toISOString() });
    if (claimErr?.code === '23505') continue;
    if (claimErr) {
      fehler.push(`${u.name}: ${claimErr.message}`);
      continue;
    }
    const vorname = einzeilig(u.name.split(' ')[0] || u.name, 30);
    const text = listenText(liste, heute, alle.length);
    try {
      if (tmpl && z && nummer) {
        await getProvider().sendMessage(z.phoneNumberId, z.token, {
          to: nummer,
          type: 'template',
          template: { name: tmpl.name, language: { code: 'de' }, components: [{ type: 'body', parameters: [vorname, text].map((t) => ({ type: 'text', text: t })) }] },
        });
        gesendet++;
      } else {
        const { createNotification } = await import('@/lib/notifications/create');
        await createNotification(svc, {
          user_id: u.id,
          title: `☀️ ${alle.length === 1 ? '1 Aufgabe' : `${alle.length} Aufgaben`} für heute`,
          body: text.slice(0, 200),
          type: 'task_due',
          push_url: '/boards',
        });
        push++;
      }
    } catch (err) {
      // Freigeben, damit der Job-Retry es nochmal versucht
      await svc.from('aufgaben_tageslisten').delete().eq('user_id', u.id).eq('tag', heute);
      fehler.push(`${u.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (fehler.length) throw new Error(`Tagesliste teilweise fehlgeschlagen (${gesendet} gesendet): ${fehler.join('; ')}`);
  return { gesendet, push, fehler };
}

export interface BefehlJob {
  user_id: string;
  phone: string;
  text: string;
  message_id: string;
}

/** Job aufgaben.whatsapp_befehl – „erledigt 2“ / „liste“ von einem internen Nutzer */
export async function verarbeiteBefehl(svc: SupabaseClient, job: BefehlJob, jetzt: Date = new Date()): Promise<void> {
  const heute = berlinTag(jetzt);
  const { token, phoneNumberId } = await zugang(svc);
  const antworte = (body: string) => getProvider().sendMessage(phoneNumberId, token, { to: job.phone, type: 'text', text: { body } }).catch((err) => console.error('[tagesliste] Antwort fehlgeschlagen', err));

  const nummern = leseErledigt(job.text);
  if (nummern) {
    // Bezug: die zuletzt verschickte Liste (heute, sonst die letzte der vergangenen 3 Tage)
    const seit = new Date(jetzt.getTime() - 3 * 864e5).toISOString().slice(0, 10);
    const { data: l } = await svc.from('aufgaben_tageslisten').select('tag, task_ids').eq('user_id', job.user_id).gte('tag', seit).order('tag', { ascending: false }).limit(1).maybeSingle();
    const liste = l as { tag: string; task_ids: string[] } | null;
    if (!liste) {
      await antworte('Ich habe gerade keine Liste von dir. Schreib „liste“, dann schicke ich dir deine Aufgaben für heute mit Nummern.');
      return;
    }
    const ids = nummern.map((n) => liste.task_ids[n - 1]).filter((x): x is string => !!x);
    const ungueltig = nummern.filter((n) => !liste.task_ids[n - 1]);
    if (!ids.length) {
      await antworte(`Die Nummer ${ungueltig.join(', ')} gibt es in deiner Liste nicht (1–${liste.task_ids.length}).`);
      return;
    }
    const { data: tasks } = await svc.from('internal_tasks').select('id, title, status').in('id', ids);
    const offen = ((tasks ?? []) as Array<{ id: string; title: string; status: string }>).filter((t) => t.status !== 'done');
    if (offen.length) {
      const { error } = await svc.from('internal_tasks').update({ status: 'done', erledigt_am: jetzt.toISOString() }).in('id', offen.map((t) => t.id)).neq('status', 'done');
      if (error) throw new Error(`Abhaken fehlgeschlagen: ${error.message}`);
    }
    const titel = ids.map((id) => ((tasks ?? []) as Array<{ id: string; title: string }>).find((t) => t.id === id)?.title).filter(Boolean);
    const rest = (await faelligeAufgaben(svc, job.user_id, heute)).length;
    await antworte(
      `✅ Erledigt: ${titel.join(', ')}${ungueltig.length ? `\n(Nummer ${ungueltig.join(', ')} gibt es nicht.)` : ''}\n\n${rest ? `Noch ${rest} fällig für heute.` : 'Alles für heute erledigt – stark! 🎉'}`,
    );
    return;
  }

  if (istListenBefehl(job.text)) {
    const alle = await faelligeAufgaben(svc, job.user_id, heute);
    if (!alle.length) {
      await antworte('Für heute ist nichts fällig. 🎉');
      return;
    }
    const liste = alle.slice(0, MAX_LISTE);
    await svc.from('aufgaben_tageslisten').upsert({ user_id: job.user_id, tag: heute, task_ids: liste.map((a) => a.id), gesendet_am: jetzt.toISOString() }, { onConflict: 'user_id,tag' });
    const zeilen = liste.map((a, i) => `${i + 1}) ${a.title}${a.due_date && a.due_date < heute ? ' (überfällig)' : ''}`);
    await antworte(
      `Deine Aufgaben für heute:\n${zeilen.join('\n')}${alle.length > liste.length ? `\n… und ${alle.length - liste.length} weitere im Board` : ''}\n\nAbhaken: „erledigt 2“ oder „erledigt 1 3“.`,
    );
  }
}
