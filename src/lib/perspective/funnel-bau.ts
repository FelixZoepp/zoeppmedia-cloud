/**
 * Funnel automatisch bauen (Perspective):
 *   Vorlagen-Funnel duplizieren → freigegebene Funnel-Texte per KI-Edit einsetzen → veröffentlichen
 *   → URL + Funnel-ID speichern → Schritt „Funnel aufgebaut“ abhaken.
 *
 * Läuft als Zustandsmaschine über perspective_funnels.bau_status, weil die KI-Bearbeitung in Perspective
 * asynchron ist (bis ~5 Minuten). `treibeFunnelBauVoran` macht jeweils einen Schritt weiter und ist
 * gefahrlos mehrfach aufrufbar (Route per after(), Status-Abfrage der Oberfläche, später der Tick).
 *
 * Was die API NICHT kann (laut Doku/Tool-Schemas): Meta-Pixel des Kunden setzen, Lead-Webhook ändern.
 * Das Duplikat übernimmt Integrationen und Marke der Vorlage – die Vorlage muss deshalb den Cloud-Webhook
 * OHNE ?agency= haben; die Zuordnung zum Kunden läuft über perspective_funnel_id (siehe Webhook-Route).
 * Pixel/Domain/Webhook-Kontrolle wird als konkrete interne Aufgabe angelegt.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFunnelName } from '@/lib/ai/funnel-prompt';
import type { FunnelTexte } from '@/lib/fulfillment/generator';
import { setStepStatus } from '@/lib/fulfillment/engine';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { PerspectiveMcp, feld } from './mcp-client';

export type BauStatus = 'gestartet' | 'dupliziert' | 'texte_in_arbeit' | 'texte_fertig' | 'veroeffentlicht' | 'fehler';
export const AKTIVE_BAU_STATUS: BauStatus[] = ['gestartet', 'dupliziert', 'texte_in_arbeit', 'texte_fertig'];

export interface FunnelBauZeile {
  id: string;
  agency_id: string;
  name: string;
  perspective_funnel_id: string | null;
  url: string | null;
  editor_url: string | null;
  bau_status: BauStatus | null;
  bau_job_id: string | null;
  bau_fehler: string | null;
  auto_veroeffentlichen: boolean;
}

const SPALTEN = 'id, agency_id, name, perspective_funnel_id, url, editor_url, bau_status, bau_job_id, bau_fehler, auto_veroeffentlichen';
const CLOUD_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';

/** Vorlagen-Funnel: zuerst je Produkt (perspective_vorlage_funnel_id:<produkt>), sonst global. */
export async function ladeVorlage(svc: SupabaseClient, produkt: string | null): Promise<string | null> {
  const keys = [produkt ? `perspective_vorlage_funnel_id:${produkt}` : null, 'perspective_vorlage_funnel_id'].filter(Boolean) as string[];
  const { data } = await svc.from('system_einstellungen').select('key, wert').in('key', keys);
  const werte = new Map(((data ?? []) as Array<{ key: string; wert: string }>).map((r) => [r.key, r.wert.trim()]));
  for (const k of keys) {
    const v = werte.get(k);
    if (v && /^[0-9a-fA-F]{24}$/.test(v)) return v;
  }
  return null;
}

/** Anweisung für die Perspective-KI: Texte der Vorlage ersetzen, Aufbau/Formular/Integrationen behalten. */
export function baueTextPrompt(t: FunnelTexte, firma: string): string {
  const vorteile = t.vorteile.map((v) => `- ${v}`).join('\n');
  const quiz = t.quiz.map((q, i) => `${i + 1}. ${q.frage}\n   Antworten: ${q.antworten.join(' | ')}`).join('\n');
  return [
    `Passe diesen Recruiting-Funnel für die Firma "${firma}" an. Ersetze ausschließlich die Texte durch die folgenden – Aufbau, Design, Seitenreihenfolge, das Kontaktformular (Name, Telefon, E-Mail) und alle Integrationen bleiben unverändert.`,
    '',
    `Headline: ${t.headline}`,
    `Subheadline: ${t.subheadline}`,
    '',
    'Vorteile:',
    vorteile,
    '',
    'Qualifizierungsfragen (in dieser Reihenfolge, als Auswahl-Schritte):',
    quiz,
    '',
    `Text über dem Kontaktformular: ${t.formular_text}`,
    `Danke-Seite: ${t.danke_text}`,
    '',
    'Ersetze außerdem alle Firmennamen der Vorlage durch den oben genannten.',
  ].join('\n');
}

async function ladeZeile(svc: SupabaseClient, id: string): Promise<FunnelBauZeile | null> {
  const { data } = await svc.from('perspective_funnels').select(SPALTEN).eq('id', id).maybeSingle();
  return (data as FunnelBauZeile | null) ?? null;
}

async function setze(svc: SupabaseClient, id: string, patch: Partial<FunnelBauZeile> & Record<string, unknown>): Promise<void> {
  const { error } = await svc.from('perspective_funnels').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`Funnel-Bau nicht gespeichert: ${error.message}`);
}

export type StartErgebnis =
  | { ok: true; funnel: FunnelBauZeile; neu: boolean }
  | { ok: false; grund: 'keine_texte' | 'keine_vorlage' | 'nicht_konfiguriert' | 'kunde_fehlt'; meldung: string };

/**
 * Funnel-Bau starten. Idempotent: läuft für den Kunden schon ein Bau oder ist einer fertig,
 * wird dieser zurückgegeben statt einen zweiten anzulegen.
 */
export async function starteFunnelBau(
  svc: SupabaseClient,
  agencyId: string,
  opts: { autoVeroeffentlichen?: boolean; mcp?: PerspectiveMcp } = {},
): Promise<StartErgebnis> {
  const { data: vorhanden } = await svc
    .from('perspective_funnels')
    .select(SPALTEN)
    .eq('agency_id', agencyId)
    .in('bau_status', [...AKTIVE_BAU_STATUS, 'veroeffentlicht'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (vorhanden) return { ok: true, funnel: vorhanden as FunnelBauZeile, neu: false };

  if (!opts.mcp && !process.env.PERSPECTIVE_API_KEY) {
    return { ok: false, grund: 'nicht_konfiguriert', meldung: 'PERSPECTIVE_API_KEY ist nicht gesetzt – Funnel bitte von Hand bauen.' };
  }

  const [{ data: ag }, { data: inhalt }, { data: onb }] = await Promise.all([
    svc.from('agencies').select('id, name').eq('id', agencyId).maybeSingle(),
    svc.from('fulfillment_inhalte').select('id, inhalt').eq('agency_id', agencyId).eq('art', 'funnel').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    svc.from('onboarding_submissions').select('company_name, product').eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const agency = ag as { id: string; name: string } | null;
  if (!agency) return { ok: false, grund: 'kunde_fehlt', meldung: 'Kunde nicht gefunden' };
  if (!inhalt) return { ok: false, grund: 'keine_texte', meldung: 'Erst die Funnel-Texte im Generator erzeugen.' };
  const onboarding = onb as { company_name: string | null; product: string | null } | null;

  const vorlage = await ladeVorlage(svc, onboarding?.product ?? null);
  if (!vorlage) {
    return { ok: false, grund: 'keine_vorlage', meldung: 'Kein Vorlagen-Funnel hinterlegt (system_einstellungen.perspective_vorlage_funnel_id).' };
  }

  const firma = onboarding?.company_name || agency.name;
  const { data: neu, error } = await svc
    .from('perspective_funnels')
    .insert({
      agency_id: agencyId,
      name: buildFunnelName(firma),
      status: 'draft',
      vorlage_funnel_id: vorlage,
      inhalt_id: (inhalt as { id: string }).id,
      bau_status: 'gestartet',
      bau_gestartet_am: new Date().toISOString(),
      auto_veroeffentlichen: opts.autoVeroeffentlichen ?? true,
    })
    .select(SPALTEN)
    .single();
  if (error || !neu) {
    // Gleichzeitig gestartet (Unique-Index auf aktiven Bau) → den anderen zurückgeben
    if (error?.code === '23505') {
      const { data: anderer } = await svc.from('perspective_funnels').select(SPALTEN).eq('agency_id', agencyId).in('bau_status', AKTIVE_BAU_STATUS).limit(1).maybeSingle();
      if (anderer) return { ok: true, funnel: anderer as FunnelBauZeile, neu: false };
    }
    throw new Error(`Funnel-Bau konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`);
  }
  return { ok: true, funnel: neu as FunnelBauZeile, neu: true };
}

async function hakeFunnelSchrittAb(svc: SupabaseClient, agencyId: string): Promise<void> {
  const { data } = await svc
    .from('client_steps')
    .select('id, status')
    .eq('agency_id', agencyId)
    .eq('step_key', 's_funnel')
    .maybeSingle();
  const step = data as { id: string; status: string } | null;
  if (!step || step.status === 'erledigt' || step.status === 'nicht_noetig') return;
  await setStepStatus(svc, step.id, 'erledigt', { kommentar: 'Funnel automatisch in Perspective gebaut und veröffentlicht' });
}

/** Was die API nicht kann, als konkrete Aufgabe anlegen (Pixel, Domain, Webhook-Kontrolle). */
async function legeNacharbeitAn(svc: SupabaseClient, f: FunnelBauZeile, liveUrl: string | null): Promise<void> {
  const titel = `Funnel prüfen: Pixel & Webhook — ${f.name}`;
  const { data: schon } = await svc.from('internal_tasks').select('id').eq('agency_id', f.agency_id).eq('title', titel).limit(1).maybeSingle();
  if (schon) return;
  const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await svc.from('internal_tasks').insert({
    title: titel,
    description: [
      'Der Funnel wurde automatisch in Perspective gebaut. Diese Punkte kann die Perspective-Schnittstelle nicht setzen:',
      `1. Meta-Pixel des Kunden im Funnel eintragen (Editor: ${f.editor_url ?? 'in Perspective öffnen'}).`,
      `2. Lead-Webhook prüfen: muss auf ${CLOUD_URL}/api/webhooks/perspective zeigen – OHNE ?agency= (sonst landen Leads beim Kunden der Vorlage). Die Zuordnung läuft über die Funnel-ID.`,
      '3. Eigene Domain des Kunden: falls gewünscht, in Perspective verbinden und neu veröffentlichen.',
      '4. Test-Lead durchschicken (Ablauf → Test-Lead).',
      liveUrl ? `Live: ${liveUrl}` : '',
    ].filter(Boolean).join('\n'),
    agency_id: f.agency_id,
    status: 'todo',
    priority: 'high',
    due_date: morgen,
    created_by: null,
  });
}

/**
 * Einen Schritt weiter bauen. Gibt den neuen Stand zurück. Fehler der Perspective-Seite landen in
 * bau_status='fehler' + bau_fehler (kein Throw), damit Aufrufer im Hintergrund nicht abstürzen.
 */
export async function treibeFunnelBauVoran(
  svc: SupabaseClient,
  funnelId: string,
  opts: { mcp?: PerspectiveMcp; veroeffentlichenErzwingen?: boolean } = {},
): Promise<FunnelBauZeile | null> {
  const f = await ladeZeile(svc, funnelId);
  if (!f || !f.bau_status || !AKTIVE_BAU_STATUS.includes(f.bau_status)) return f;

  try {
    const mcp = opts.mcp ?? PerspectiveMcp.ausEnv();

    if (f.bau_status === 'gestartet') {
      const { data: row } = await svc.from('perspective_funnels').select('vorlage_funnel_id').eq('id', f.id).maybeSingle();
      const vorlage = (row as { vorlage_funnel_id: string | null } | null)?.vorlage_funnel_id;
      if (!vorlage) throw new Error('Vorlage fehlt');
      const r = await mcp.tool('duplicate_funnel', { funnelId: vorlage, data: { name: f.name } });
      const neueId = feld(r, 'id', 'funnelId', '_id');
      if (!neueId) throw new Error('Duplikat ohne Funnel-ID zurückgekommen');
      await setze(svc, f.id, { perspective_funnel_id: neueId, editor_url: feld(r, 'editorUrl', 'editor_url'), bau_status: 'dupliziert' });
      return treibeFunnelBauVoran(svc, f.id, opts);
    }

    if (f.bau_status === 'dupliziert') {
      const { data: row } = await svc.from('perspective_funnels').select('inhalt_id').eq('id', f.id).maybeSingle();
      const inhaltId = (row as { inhalt_id: string | null } | null)?.inhalt_id;
      const { data: inh } = inhaltId
        ? await svc.from('fulfillment_inhalte').select('inhalt').eq('id', inhaltId).maybeSingle()
        : await svc.from('fulfillment_inhalte').select('inhalt').eq('agency_id', f.agency_id).eq('art', 'funnel').order('created_at', { ascending: false }).limit(1).maybeSingle();
      const texte = (inh as { inhalt: FunnelTexte } | null)?.inhalt;
      if (!texte) throw new Error('Funnel-Texte nicht mehr vorhanden');
      const { data: ag } = await svc.from('agencies').select('name').eq('id', f.agency_id).maybeSingle();
      const r = await mcp.tool('update_funnel', { funnelId: f.perspective_funnel_id, prompt: baueTextPrompt(texte, (ag as { name: string } | null)?.name ?? f.name) });
      const jobId = feld(r, 'jobId', 'job_id');
      if (!jobId) throw new Error('KI-Bearbeitung ohne Job-ID gestartet');
      await setze(svc, f.id, { bau_job_id: jobId, editor_url: feld(r, 'editorUrl') ?? f.editor_url, bau_status: 'texte_in_arbeit' });
      return ladeZeile(svc, f.id);
    }

    if (f.bau_status === 'texte_in_arbeit') {
      // Long-Poll: blockiert serverseitig bis ~20 s
      const r = await mcp.tool('get_funnel_job_status', { jobId: f.bau_job_id });
      const status = (feld(r, 'status') ?? '').toLowerCase();
      if (status === 'failed' || status === 'error') throw new Error(feld(r, 'error', 'reason', 'message') ?? 'KI-Bearbeitung fehlgeschlagen');
      if (status !== 'completed') return f;
      await setze(svc, f.id, { bau_status: 'texte_fertig', editor_url: feld(r, 'editorUrl') ?? f.editor_url });
      return treibeFunnelBauVoran(svc, f.id, opts);
    }

    if (f.bau_status === 'texte_fertig') {
      if (!f.auto_veroeffentlichen && !opts.veroeffentlichenErzwingen) return f;
      const { data: dom } = await svc.from('system_einstellungen').select('wert').eq('key', 'perspective_domain_id').maybeSingle();
      const domainId = (dom as { wert: string } | null)?.wert?.trim() || null;
      const r = await mcp.tool('publish_funnel', { funnelId: f.perspective_funnel_id, ...(domainId ? { data: { domainId } } : {}) });
      const liveUrl = feld(r, 'liveUrl', 'url', 'publicUrl');
      await setze(svc, f.id, { bau_status: 'veroeffentlicht', status: 'published', url: liveUrl ?? f.url, bau_fehler: null });
      const fertig = await ladeZeile(svc, f.id);
      await hakeFunnelSchrittAb(svc, f.agency_id);
      if (fertig) await legeNacharbeitAn(svc, fertig, liveUrl);
      await createNotificationForInternals(svc, {
        title: 'Funnel automatisch gebaut',
        body: `${f.name} ist live${liveUrl ? `: ${liveUrl}` : ''}. Bitte Pixel & Webhook prüfen.`,
        type: 'system',
        agency_id: f.agency_id,
        entity_type: 'agency',
        entity_id: f.agency_id,
        push_url: `/clients/${f.agency_id}/ablauf`,
      }).catch(() => {});
      return fertig;
    }
    return f;
  } catch (err) {
    const meldung = err instanceof Error ? err.message : String(err);
    await setze(svc, f.id, { bau_status: 'fehler', bau_fehler: meldung.slice(0, 500) }).catch(() => {});
    await createNotificationForInternals(svc, {
      title: 'Funnel-Bau fehlgeschlagen',
      body: `${f.name}: ${meldung.slice(0, 200)}`,
      type: 'system',
      agency_id: f.agency_id,
      entity_type: 'agency',
      entity_id: f.agency_id,
      push_url: `/clients/${f.agency_id}/ablauf`,
    }).catch(() => {});
    return ladeZeile(svc, f.id);
  }
}

/** Bau so lange vorantreiben, bis er fertig/blockiert ist oder das Zeitbudget aufgebraucht ist. */
export async function baueFunnelBisFertig(
  svc: SupabaseClient,
  funnelId: string,
  opts: { mcp?: PerspectiveMcp; budgetMs?: number; jetzt?: () => number } = {},
): Promise<FunnelBauZeile | null> {
  const jetzt = opts.jetzt ?? Date.now;
  const ende = jetzt() + (opts.budgetMs ?? 240_000);
  let stand = await ladeZeile(svc, funnelId);
  while (stand?.bau_status && AKTIVE_BAU_STATUS.includes(stand.bau_status) && jetzt() < ende) {
    const vorher = stand.bau_status;
    stand = await treibeFunnelBauVoran(svc, funnelId, opts);
    // Warten auf Freigabe zum Veröffentlichen → nichts mehr zu tun
    if (stand?.bau_status === 'texte_fertig' && !stand.auto_veroeffentlichen) break;
    if (stand?.bau_status === vorher && vorher !== 'texte_in_arbeit') break;
  }
  return stand;
}

/** Für einen regelmäßigen Lauf (z. B. /api/cron/tick): alle offenen Bauten ein Stück weiter. */
export async function treibeAlleFunnelBautenVoran(svc: SupabaseClient, opts: { mcp?: PerspectiveMcp; max?: number } = {}): Promise<number> {
  if (!opts.mcp && !process.env.PERSPECTIVE_API_KEY) return 0;
  const { data } = await svc
    .from('perspective_funnels')
    .select('id')
    .in('bau_status', AKTIVE_BAU_STATUS)
    .limit(opts.max ?? 5);
  let n = 0;
  for (const r of (data ?? []) as Array<{ id: string }>) {
    await treibeFunnelBauVoran(svc, r.id, opts);
    n++;
  }
  return n;
}
