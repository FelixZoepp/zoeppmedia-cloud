/**
 * Close aufräumen (einmalig, Einrichtungsschritt „close_aufraeumen“ – von Felix freigegeben):
 * - Opportunity-Feld „Closed Lost Reason“ → „Verlustgrund“ mit deutschen Gründen (gleiche Sprache wie die Disqualifizierungs-Gründe)
 * - Anruf-Ergebnisse (Close-Standard, Englisch) → deutsche Namen (IDs bleiben, alte Anrufe behalten ihr Ergebnis)
 * - Lead-Status ohne Leads und ohne Verwendung in Code/Smart Views löschen
 * Vorher-Stand wird in system_einstellungen.close_aufraeumen_vorher gesichert.
 *
 * Dazu Verlustgrund-Pflicht: Opportunity geht auf „verloren“ ohne Grund → Close-Aufgabe „Verlustgrund eintragen“ (Job sales.verlustgrund).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENCY_ID } from './calendly-chain';
import { istFreigegeben } from '@/lib/freigaben';

export const VERLUSTGRUND_FELD = 'cf_VyMmJUFUh8pHoKi14eNuxAavZOT8LCrdpPGKXhsjie0';
export const VERLUSTGRUENDE = [
  'Kein Bedarf (GS 1)',
  'Kein Budget / nicht liquide (GS 2)',
  'Entscheider fehlt (GS 3)',
  'Kein zeitnaher Start (GS 4)',
  'Respektlos (GS 5)',
  'Passt nicht (Branche/Modell)',
  'Anderer Anbieter',
  'Nicht mehr erreichbar (Ghosting)',
  'Sonstiges (Notiz)',
];

export const ANRUF_ERGEBNISSE: Record<string, string> = {
  outcome_030cQuf7gjOcMgKr8314uu: 'Erreicht',
  outcome_030cQuf7aQZjxjmzcpIk7B: 'Mailbox – Nachricht hinterlassen',
  outcome_030cQuf7mX4qIi8Dn2EbWa: 'Mailbox – keine Nachricht',
  outcome_030cQuf7yYzLq1rHwiWz5z: 'Rückruf / Follow-up nötig',
  outcome_030cQuf84cKsZp3HhIDeV6: 'Kein Interesse',
  outcome_030cQuf8AkAPtpIgkrAxE9: 'Passt nicht (unqualifiziert)',
  outcome_030cQuf8Gt3WJffpl3q1LM: 'Qualifiziert',
  outcome_030cQuf8N1NWLVLjJL0owY: 'Termin gelegt',
};

/** 0 Leads, nicht im Code, nicht in Smart Views (geprüft am 12.10.2026) */
export const UNGENUTZTE_STATUS: Record<string, string> = {
  stat_VOYlu7IDrVfM2b7sJEuSZh7yg8l8iROyaqkFl72h8gD: 'Kein Interesse/Bedarf',
  stat_VRW9P4kJbS2UIZ3inNXaSwiq9gGXqKavqorykXGKog7: 'Telefonisch schwer erreichbar',
  stat_WR3PeRWIVjd420Rr7mn9mPKR44BvHAZ6kMXGaY5DNvm: 'High Prio',
  stat_MJup3ZQf4bJ5MOOrx4H9ROJbwi74x3WTkoRNy3vOR1a: 'Nurture',
};

function headers(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}

async function close<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.close.com/api/v1${path}`, { ...init, headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`);
  return (res.status === 204 ? {} : await res.json()) as T;
}

export async function raeumeCloseAuf(svc: SupabaseClient): Promise<Record<string, unknown>> {
  const erg: Record<string, unknown> = {};
  const vorher: Record<string, unknown> = {};

  // 1) Verlustgrund
  const feld = await close<{ name: string; choices: string[] }>(`/custom_field/opportunity/${VERLUSTGRUND_FELD}/`);
  vorher.verlustgrund = { name: feld.name, choices: feld.choices };
  await close(`/custom_field/opportunity/${VERLUSTGRUND_FELD}/`, { method: 'PUT', body: JSON.stringify({ name: 'Verlustgrund', choices: VERLUSTGRUENDE }) });
  erg.verlustgrund = 'umbenannt';

  // 2) Anruf-Ergebnisse
  const outs = await close<{ data: Array<{ id: string; name: string }> }>('/outcome/');
  vorher.ergebnisse = outs.data;
  const umbenannt: string[] = [];
  for (const o of outs.data) {
    const neu = ANRUF_ERGEBNISSE[o.id];
    if (!neu || o.name === neu) continue;
    try {
      await close(`/outcome/${o.id}/`, { method: 'PUT', body: JSON.stringify({ name: neu }) });
      umbenannt.push(`${o.name} → ${neu}`);
    } catch (e) {
      umbenannt.push(`${o.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  erg.ergebnisse = umbenannt;

  // 3) Ungenutzte Lead-Status – nur löschen, wenn wirklich kein Lead darauf steht
  const geloescht: string[] = [];
  for (const [id, label] of Object.entries(UNGENUTZTE_STATUS)) {
    const r = await close<{ total_results: number }>(`/lead/?query=${encodeURIComponent(`lead_status:"${label}"`)}&_limit=0`).catch(() => ({ total_results: -1 }));
    if (r.total_results !== 0) {
      geloescht.push(`${label}: übersprungen (${r.total_results} Leads)`);
      continue;
    }
    try {
      await close(`/status/lead/${id}/`, { method: 'DELETE' });
      geloescht.push(`${label}: gelöscht`);
    } catch (e) {
      geloescht.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  erg.status = geloescht;

  await svc.from('system_einstellungen').upsert({ key: 'close_aufraeumen_vorher', wert: JSON.stringify(vorher), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  await svc.from('system_einstellungen').upsert({ key: 'close_aufraeumen_ergebnis', wert: JSON.stringify(erg), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return erg;
}

/** Webhook-Ereignis: ist die Opportunity gerade verloren gegangen? (rein, testbar) */
export function istVerloren(ev: { object_type?: string; action?: string; changed_fields?: string[]; data?: { status_type?: string }; previous_data?: { status_type?: string } } | undefined): boolean {
  if (ev?.object_type !== 'opportunity' || ev.data?.status_type !== 'lost') return false;
  if (ev.action === 'created') return true;
  return ev.action === 'updated' && (ev.changed_fields ?? []).some((f) => f.startsWith('status')) && ev.previous_data?.status_type !== 'lost';
}

export async function planeVerlustgrundCheck(svc: SupabaseClient, oppId: string): Promise<void> {
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.verlustgrund',
    // Zeit lassen, den Grund direkt beim Verloren-Setzen einzutragen
    run_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    payload: { opp_id: oppId },
    status: 'pending',
    dedupe_key: `sales.verlustgrund:${oppId}:${new Date().toISOString().slice(0, 10)}`,
  });
  if (error && error.code !== '23505') throw new Error(`Verlustgrund-Check nicht geplant: ${error.message}`);
}

/** Job sales.verlustgrund: verloren ohne Grund → Close-Aufgabe für den Verantwortlichen */
export async function pruefeVerlustgrund(svc: SupabaseClient, oppId: string): Promise<string> {
  if (!(await istFreigegeben(svc, 'verlustgrund_aufgabe'))) return 'aus';
  const o = await close<Record<string, unknown> & { lead_id: string; lead_name?: string; user_id?: string | null; status_type: string }>(`/opportunity/${oppId}/`);
  if (o.status_type !== 'lost') return 'nicht_verloren';
  const grund = o[`custom.${VERLUSTGRUND_FELD}`];
  if (Array.isArray(grund) ? grund.length : grund) return 'grund_vorhanden';
  await close('/task/', {
    method: 'POST',
    body: JSON.stringify({
      lead_id: o.lead_id,
      ...(o.user_id ? { assigned_to: o.user_id } : {}),
      text: `❓ Verlustgrund eintragen (${o.lead_name ?? 'Deal'}): Opportunity öffnen → Feld „Verlustgrund“ – ohne Grund wissen wir nicht, woran wir verlieren`,
      date: new Date().toISOString().slice(0, 10),
    }),
  });
  return 'aufgabe';
}
