/**
 * Video-Freigabe: Benachrichtigungen und Tageserinnerung.
 * - Neues Video / neue Version → Prüfer (Standard: erster Admin)
 * - Änderungen angefordert / freigegeben → Bearbeiter
 * - Täglich ab 17 Uhr: Sammelhinweis an jeden Prüfer, wenn Videos auf Freigabe warten
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { berlinTag } from '@/lib/zeit/berlin';

export async function standardPruefer(svc: SupabaseClient): Promise<string | null> {
  const { data } = await svc.from('users').select('id').eq('role', 'admin').neq('aktiv', false).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function meldeVideo(
  svc: SupabaseClient,
  an: string | null,
  vonId: string | null,
  videoId: string,
  title: string,
  body: string,
): Promise<void> {
  if (!an || an === vonId) return;
  const { createNotification } = await import('@/lib/notifications/create');
  await createNotification(svc, { user_id: an, title, body, type: 'task_assigned', push_url: `/videos/${videoId}` }).catch((err) =>
    console.error('[videos] Benachrichtigung fehlgeschlagen', err),
  );
}

/** Tick: ab 17 Uhr einmal täglich die Sammelerinnerung planen */
export async function planeVideoErinnerung(svc: SupabaseClient, jetzt: Date = new Date()): Promise<void> {
  const stunde = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).formatToParts(jetzt).find((x) => x.type === 'hour')?.value ?? 0);
  if (stunde < 17) return;
  const tag = berlinTag(jetzt);
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'videos.erinnerung',
    run_at: jetzt.toISOString(),
    payload: { tag },
    status: 'pending',
    dedupe_key: `videos.erinnerung:${tag}`,
  });
  if (error && error.code !== '23505') console.error('[videos] Erinnerung nicht geplant:', error.message);
}

/** Job videos.erinnerung */
export async function erinnerePruefer(svc: SupabaseClient): Promise<number> {
  const { data } = await svc.from('videos').select('id, titel, pruefer_id').eq('status', 'in_pruefung');
  const jePruefer = new Map<string, Array<{ id: string; titel: string }>>();
  const standard = await standardPruefer(svc);
  for (const v of (data ?? []) as Array<{ id: string; titel: string; pruefer_id: string | null }>) {
    const p = v.pruefer_id ?? standard;
    if (p) jePruefer.set(p, [...(jePruefer.get(p) ?? []), v]);
  }
  const { createNotification } = await import('@/lib/notifications/create');
  for (const [p, liste] of jePruefer) {
    await createNotification(svc, {
      user_id: p,
      title: liste.length === 1 ? `1 Video wartet auf deine Freigabe` : `${liste.length} Videos warten auf deine Freigabe`,
      body: liste.slice(0, 4).map((v) => v.titel).join(' · '),
      type: 'task_due',
      push_url: '/videos',
    }).catch(() => {});
  }
  return jePruefer.size;
}
