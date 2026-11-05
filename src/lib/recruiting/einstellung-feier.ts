/**
 * Einstellungs-Feier: Ein Kunde hat einen Bewerber eingestellt.
 * Geplant per DB-Trigger (Migration 20261101000100) als Job recruiting.einstellung_feier – einmal je Bewerber.
 * - Slack #wins (sonst #fulfillment): Nachricht mit GIF, Kunde, Stelle, Einstellung Nr. beim Kunden und im Monat
 * - Cloud: Konfetti-Animation beim Kunden und intern (components/einstellung-feier.tsx)
 * Rein intern – an den Bewerber geht nichts. Im Slack nur der Vorname (Datensparsamkeit).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { slackKanal } from '@/lib/slack/kanaele';
import { berlinMonatsStart } from '@/lib/zeit/berlin';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { FEIER_GIF } from '@/lib/sales/deal-feier';

/** Nur der Vorname, nie der volle Name (rein, testbar) */
export function vorname(name: string | null | undefined): string | null {
  const v = name?.trim().split(/\s+/)[0];
  return v ? v.slice(0, 40) : null;
}

/** Slack-Nachricht bauen (rein, testbar) */
export function baueEinstellungNachricht(f: { kunde: string; vorname: string | null; stelle: string | null; nrKunde: number; nrMonat: number; monat: string }): { text: string; blocks: unknown[] } {
  const wer = f.vorname ? `*${f.vorname}*` : 'einen neuen Mitarbeiter';
  const als = f.stelle ? ` als *${f.stelle}*` : '';
  const text = `🎉 EINGESTELLT! ${f.kunde} hat ${f.vorname ?? 'einen neuen Mitarbeiter'} eingestellt`;
  return {
    text,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🎉🥂 NEUE EINSTELLUNG! 🥂🎉', emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🏆 *${f.kunde}* hat ${wer}${als} eingestellt!\n📈 Einstellung Nr. *${f.nrKunde}* für ${f.kunde} über Zoepp Consulting\n🔥 Einstellung Nr. *${f.nrMonat}* über alle Kunden im ${f.monat}`,
        },
      },
      { type: 'image', image_url: FEIER_GIF, alt_text: 'Einstellung' },
      { type: 'context', elements: [{ type: 'mrkdwn', text: '💪 Genau dafür machen wir das! · <https://cloud.zoeppmedia.de/admin/kontrollzentrum|Kontrollzentrum>' }] },
    ],
  };
}

/** Job recruiting.einstellung_feier */
export async function feiereEinstellung(svc: SupabaseClient, candidateId: string): Promise<string> {
  const { data: c, error } = await svc
    .from('candidates')
    .select('id, name, agency_id, deleted_at, eingestellt_am, pipeline_stages!candidates_current_stage_id_fkey(stage_type), agencies!candidates_agency_id_fkey(name)')
    .eq('id', candidateId)
    .maybeSingle();
  if (error) throw new Error(`Bewerber nicht lesbar: ${error.message}`);
  const k = c as unknown as {
    id: string;
    name: string | null;
    agency_id: string;
    deleted_at: string | null;
    eingestellt_am: string | null;
    pipeline_stages: { stage_type: string } | null;
    agencies: { name: string } | null;
  } | null;
  if (!k || k.deleted_at) return 'nicht_vorhanden';
  if (k.agency_id === SALES_AGENCY_ID) return 'intern';
  // Nur feiern, wenn er (noch) eingestellt ist – Fehlklick und sofort zurück zählt nicht
  if (k.pipeline_stages?.stage_type !== 'hired' && !k.eingestellt_am) return 'nicht_eingestellt';

  const { data: app } = await svc.from('applications').select('jobs(title)').eq('candidate_id', k.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const stelle = (app as unknown as { jobs: { title: string | null } | null } | null)?.jobs?.title ?? null;

  const [{ count: nrKunde }, { count: nrMonat }] = await Promise.all([
    svc.from('einstellung_feiern').select('id', { count: 'exact', head: true }).eq('agency_id', k.agency_id),
    svc.from('einstellung_feiern').select('id', { count: 'exact', head: true }).gte('created_at', berlinMonatsStart().toISOString()),
  ]);
  const kunde = k.agencies?.name ?? 'Ein Kunde';
  const zeile = { candidate_id: k.id, agency_id: k.agency_id, kunde, vorname: vorname(k.name), stelle, nr_kunde: (nrKunde ?? 0) + 1, nr_monat: (nrMonat ?? 0) + 1 };
  const { data: feier, error: insFehler } = await svc.from('einstellung_feiern').insert(zeile).select('id').single();
  if (insFehler?.code === '23505') return 'schon_gefeiert';
  if (insFehler) throw new Error(insFehler.message);

  const token = process.env.SLACK_BOT_TOKEN;
  const kanal = (await slackKanal('wins')) ?? (await slackKanal('fulfillment'));
  if (!token || !kanal) {
    console.error('[einstellung-feier] Kein Slack-Kanal (#wins / #fulfillment) – Bot in den Kanal einladen');
    return 'ohne_slack';
  }
  const monat = new Date().toLocaleDateString('de-DE', { month: 'long', timeZone: 'Europe/Berlin' });
  const r = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: kanal, ...baueEinstellungNachricht({ kunde, vorname: zeile.vorname, stelle, nrKunde: zeile.nr_kunde, nrMonat: zeile.nr_monat, monat }) }),
  });
  const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  // Kein Retry (Feier ist gespeichert, sonst doppelte Slack-Posts)
  if (!d.ok) {
    console.error('[einstellung-feier] Slack:', d.error);
    return 'slack_fehler';
  }
  await svc.from('einstellung_feiern').update({ slack_am: new Date().toISOString() }).eq('id', (feier as { id: string }).id);
  return 'gefeiert';
}
