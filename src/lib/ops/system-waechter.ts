/**
 * System-Wächter (alle 5 Minuten aus dem Tick): findet Ausfälle, bevor Kunden sie merken, und meldet sie in Slack.
 *
 * - Sonden: die echten Abfragen von Inbox, Chat, Bewerberliste und Bewerbungen (fängt z. B. mehrdeutige Verknüpfungen nach Migrationen)
 * - Endgültig gescheiterte Jobs und Webhook-Events
 * - Stau in der Warteschlange
 * - Nicht zugestellte WhatsApp-Nachrichten
 *
 * Nur lesend; schreibt ausschließlich system_alarme und meldet intern nach Slack.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { berlinTag } from '@/lib/zeit/berlin';
import { meldeAlarm, meldeBehoben } from './slack-alarm';
import { BEWERBER_LISTE_SELECT, BEWERBUNGEN_SELECT, CHAT_NACHRICHTEN_SELECT, INBOX_LISTE_SELECT } from './abfragen';

export const HERZSCHLAG_KEY = 'herzschlag_tick';

interface Sonde {
  key: string;
  name: string;
  tabelle: string;
  select: string;
  link: string;
}

export const SONDEN: Sonde[] = [
  { key: 'inbox', name: 'Inbox / Chat-Liste', tabelle: 'conversations', select: INBOX_LISTE_SELECT, link: '/inbox' },
  { key: 'chat', name: 'Chatverlauf', tabelle: 'messages', select: CHAT_NACHRICHTEN_SELECT, link: '/inbox' },
  { key: 'bewerber', name: 'Bewerberliste', tabelle: 'candidates', select: BEWERBER_LISTE_SELECT, link: '/candidates' },
  { key: 'bewerbungen', name: 'Bewerbungen', tabelle: 'applications', select: BEWERBUNGEN_SELECT, link: '/candidates' },
];

/** Alle 5 Minuten einen Wächter-Job einplanen (Dedupe je 5-Minuten-Fenster) */
export async function planeSystemWaechter(svc: SupabaseClient, jetzt: Date = new Date()): Promise<void> {
  const fenster = Math.floor(jetzt.getTime() / 300_000);
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'ops.system_waechter',
    run_at: jetzt.toISOString(),
    payload: {},
    status: 'pending',
    dedupe_key: `ops.system_waechter:${fenster}`,
  });
  if (error && error.code !== '23505') console.error('[system-waechter] nicht geplant:', error.message);
}

/** Herzschlag des Ticks merken (für /api/ops/herzschlag) */
export async function schreibeHerzschlag(svc: SupabaseClient, jetzt: Date = new Date()): Promise<void> {
  await svc.from('system_einstellungen').upsert({ key: HERZSCHLAG_KEY, wert: jetzt.toISOString() }, { onConflict: 'key' });
}

function gruppiere<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

export interface WaechterErgebnis {
  sondenFehler: string[];
  toteJobs: number;
  toteEvents: number;
  stau: number;
  nichtZugestellt: number;
}

export async function pruefeSystem(svc: SupabaseClient, jetzt: Date = new Date()): Promise<WaechterErgebnis> {
  const ergebnis: WaechterErgebnis = { sondenFehler: [], toteJobs: 0, toteEvents: 0, stau: 0, nichtZugestellt: 0 };
  // Etwas Überlappung zum 5-Minuten-Takt, doppelte Meldungen fängt die Drosselung ab
  const seit = new Date(jetzt.getTime() - 10 * 60_000).toISOString();

  // Tick läuft wieder → offenen Herzschlag-Alarm schließen
  await meldeBehoben(svc, 'herzschlag', jetzt);

  // 1. Sonden – dieselben Abfragen wie die Seiten
  for (const s of SONDEN) {
    const { error } = await svc.from(s.tabelle).select(s.select).limit(1);
    if (error) {
      ergebnis.sondenFehler.push(s.key);
      await meldeAlarm(
        svc,
        {
          schluessel: `sonde:${s.key}`,
          titel: `${s.name} funktioniert nicht`,
          text: `Die Abfrage schlägt fehl – Kunden sehen hier gerade nichts.\nFehler: ${error.code ?? ''} ${error.message}`.trim(),
          schwere: 'kritisch',
          link: s.link,
        },
        jetzt,
      );
    } else {
      await meldeBehoben(svc, `sonde:${s.key}`, jetzt);
    }
  }

  // 2. Endgültig gescheiterte Jobs (nach 5 Versuchen)
  const { data: jobs } = await svc.from('scheduled_jobs').select('type, last_error, agency_id').eq('status', 'dead').gte('updated_at', seit).limit(200);
  const jobRows = (jobs ?? []) as Array<{ type: string; last_error: string | null; agency_id: string | null }>;
  ergebnis.toteJobs = jobRows.length;
  for (const [typ, rows] of gruppiere(jobRows, (r) => r.type)) {
    await meldeAlarm(
      svc,
      {
        schluessel: `job_dead:${typ}:${berlinTag(jetzt)}`,
        titel: `Job „${typ}“ endgültig gescheitert (${rows.length}×)`,
        text: `Nach 5 Versuchen aufgegeben. Letzter Fehler: ${rows[0].last_error ?? 'unbekannt'}`,
        schwere: 'warnung',
        link: '/admin/health',
      },
      jetzt,
    );
  }

  // 3. Endgültig gescheiterte Webhook-Events (WhatsApp, Meta, Indeed …)
  const { data: events } = await svc.from('events_inbox').select('source, error').eq('status', 'dead').gte('processed_at', seit).limit(200);
  const { data: events2 } = await svc.from('events_inbox').select('source, error').eq('status', 'dead').is('processed_at', null).gte('received_at', seit).limit(200);
  const eventRows = [...((events ?? []) as Array<{ source: string; error: string | null }>), ...((events2 ?? []) as Array<{ source: string; error: string | null }>)];
  ergebnis.toteEvents = eventRows.length;
  for (const [quelle, rows] of gruppiere(eventRows, (r) => r.source)) {
    await meldeAlarm(
      svc,
      {
        schluessel: `event_dead:${quelle}:${berlinTag(jetzt)}`,
        titel: `Webhook „${quelle}“ nicht verarbeitet (${rows.length}×)`,
        text: `Eingehende Daten nach 5 Versuchen aufgegeben – z. B. Nachrichten oder Bewerber fehlen in der Cloud. Letzter Fehler: ${rows[0].error ?? 'unbekannt'}`,
        schwere: 'kritisch',
        link: '/admin/health',
      },
      jetzt,
    );
  }

  // 4. Stau: fällige Jobs, die seit über 15 Minuten nicht abgearbeitet werden
  const { count: stau } = await svc
    .from('scheduled_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lt('run_at', new Date(jetzt.getTime() - 15 * 60_000).toISOString());
  ergebnis.stau = stau ?? 0;
  if (ergebnis.stau >= 20) {
    await meldeAlarm(
      svc,
      {
        schluessel: 'stau',
        titel: `Warteschlange staut sich (${ergebnis.stau} Jobs überfällig)`,
        text: 'Erinnerungen, Bot-Nachrichten und Abgleiche laufen verspätet. Tick zu langsam oder ein Job blockiert.',
        schwere: 'warnung',
        link: '/admin/health',
      },
      jetzt,
    );
  } else if (ergebnis.stau < 5) {
    await meldeBehoben(svc, 'stau', jetzt);
  }

  // 5. Nicht zugestellte WhatsApp-Nachrichten
  const { data: fehl } = await svc
    .from('messages')
    .select('error_code')
    .eq('direction', 'out')
    .eq('status', 'failed')
    .gte('created_at', seit)
    .limit(100);
  const fehlRows = (fehl ?? []) as Array<{ error_code: string | null }>;
  ergebnis.nichtZugestellt = fehlRows.length;
  if (fehlRows.length) {
    const codes = [...new Set(fehlRows.map((r) => r.error_code ?? '?'))].join(', ');
    await meldeAlarm(
      svc,
      {
        schluessel: `whatsapp_failed:${berlinTag(jetzt)}`,
        titel: `WhatsApp nicht zugestellt (${fehlRows.length}× in 10 Min.)`,
        text: `Fehlercodes: ${codes}. Vorlage abgelehnt, Nummer gesperrt oder Konto-Problem?`,
        schwere: 'warnung',
        link: '/inbox',
      },
      jetzt,
    );
  }

  return ergebnis;
}

/** Herzschlag prüfen (von außen aufgerufen): läuft der Tick noch? */
export async function pruefeHerzschlag(svc: SupabaseClient, jetzt: Date = new Date()): Promise<{ ok: boolean; alterMin: number | null }> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', HERZSCHLAG_KEY).maybeSingle();
  const wert = (data as { wert: string } | null)?.wert;
  const alterMin = wert ? Math.round((jetzt.getTime() - new Date(wert).getTime()) / 60_000) : null;
  const ok = alterMin !== null && alterMin <= 10;
  if (!ok) {
    await meldeAlarm(
      svc,
      {
        schluessel: 'herzschlag',
        titel: 'Hintergrund-Takt steht',
        text: `Der Tick lief ${alterMin === null ? 'noch nie' : `seit ${alterMin} Min. nicht`}. Eingehende WhatsApps, Erinnerungen, Bots und Abgleiche werden gerade nicht verarbeitet.`,
        schwere: 'kritisch',
        link: '/admin/health',
      },
      jetzt,
    );
  }
  return { ok, alterMin };
}
