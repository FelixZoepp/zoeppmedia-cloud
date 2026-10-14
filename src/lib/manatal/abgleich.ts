/**
 * Manatal → Cloud: Bewerber, die sich über Manatal (z. B. Indeed-Anzeigen im Kundennamen) bewerben, minütlich abholen.
 * - Abruf über die Open API (MANATAL_API_TOKEN), neue „Matches“ (Bewerber ↔ Stelle) seit dem letzten Stand
 * - Zuordnung Manatal-Organisation → Kunde in system_einstellungen.manatal_zuordnung (unter /admin/anbindung).
 *   Nicht zugeordnete Organisationen werden ignoriert (z. B. B&C – läuft über die eigene B&C-Cloud).
 * - Anlage über ingestApplication (Quelle indeed bzw. form, idempotent über manatal:<match-id>)
 * - Kein Nachholen alter Bewerber: beim ersten Lauf startet der Stand bei „jetzt“.
 * Angeschrieben wird nur über den normalen Weg – solange „Bewerber-Kontakt“ gesperrt ist, bekommt niemand eine Nachricht.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ingestApplication } from '@/lib/recruiting/ingest';
import { findeStelle } from '@/lib/indeed/mail-eingang';
import { alarmAnAdmins } from '@/lib/ops/alarm';

const BASE = 'https://api.manatal.com/open/v3';
const CURSOR_KEY = 'manatal_cursor';
export const ZUORDNUNG_KEY = 'manatal_zuordnung';
const MAX_SEITEN = 5;
/** B&C läuft über die eigene B&C-Recruiting-Cloud – nie in die Zoepp Cloud übernehmen */
export const GESPERRTE_KUNDEN = new Set(['e66b016b-7c1f-439f-990b-201ca8a61571']);

export interface ManatalMatch {
  id: number;
  organization: number;
  job: number;
  candidate: number;
  created_at: string;
}

interface ManatalKandidat {
  id: number;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  resume: string | null;
  source_details: { portal?: { display_name?: string } } | null;
}

interface ManatalJob {
  id: number;
  position_name: string | null;
}

export function manatalAktiv(): boolean {
  return !!process.env.MANATAL_API_TOKEN;
}

async function manatal<T>(pfad: string): Promise<T> {
  const res = await fetch(pfad.startsWith('http') ? pfad : `${BASE}${pfad}`, {
    headers: { Authorization: `Token ${process.env.MANATAL_API_TOKEN ?? ''}`, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Manatal ${res.status} bei ${pfad.split('?')[0]}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

/** Manatal liefert Nummern ohne „+“ (z. B. 4915…, 0049…, 0151…) – „49…“ mit Ländervorwahl erkennen (rein, testbar) */
export function manatalTelefon(roh: string | null | undefined): string | null {
  if (!roh) return null;
  const s = roh.replace(/[^\d+]/g, '');
  if (!s) return null;
  if (/^49\d{9,12}$/.test(s)) return `+${s}`;
  return s;
}

/** Quelle aus dem Bewerbungsportal (rein, testbar). candidates.source erlaubt nur meta/indeed/manual/form/csv – Karriereseite u. Ä. = form */
export function manatalQuelle(k: Pick<ManatalKandidat, 'source_details'>): 'indeed' | 'form' {
  return /indeed/i.test(k.source_details?.portal?.display_name ?? '') ? 'indeed' : 'form';
}

async function ladeJson<T>(svc: SupabaseClient, key: string): Promise<T | null> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', key).maybeSingle();
  const w = (data as { wert: unknown } | null)?.wert;
  if (w == null) return null;
  try {
    return (typeof w === 'string' ? JSON.parse(w) : w) as T;
  } catch {
    return null;
  }
}

async function speichereJson(svc: SupabaseClient, key: string, wert: unknown): Promise<void> {
  await svc.from('system_einstellungen').upsert({ key, wert: JSON.stringify(wert), updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

/** Firmenname vergleichbar machen: Rechtsform, Sonderzeichen und Leerzeichen weg (rein, testbar) */
export function normName(n: string): string {
  return n
    .toLowerCase()
    .replace(/\(haftungsbeschränkt\)|\bgmbh\b|\bug\b|\bag\b|\bkg\b|\bco\.?\b|\be\.?\s?k\.?\b/g, ' ')
    .replace(/[^a-z0-9äöüß]/g, '');
}

/** Vorschlag Manatal-Firma → Kunde über den Namen, nur bei genau einem Treffer und nie für gesperrte Kunden (rein, testbar) */
export function schlageKundenVor(orgName: string, kunden: Array<{ id: string; name: string }>): string | null {
  const o = normName(orgName);
  if (o.length < 3) return null;
  const frei = kunden.filter((k) => !GESPERRTE_KUNDEN.has(k.id));
  const gleich = frei.filter((k) => normName(k.name) === o);
  if (gleich.length === 1) return gleich[0].id;
  const enthalten = frei.filter((k) => {
    const n = normName(k.name);
    return n.length >= 4 && (o.includes(n) || n.includes(o));
  });
  return enthalten.length === 1 ? enthalten[0].id : null;
}

export async function ladeZuordnung(svc: SupabaseClient): Promise<Record<string, string>> {
  return (await ladeJson<Record<string, string>>(svc, ZUORDNUNG_KEY)) ?? {};
}

export async function speichereZuordnung(svc: SupabaseClient, zuordnung: Record<string, string>): Promise<void> {
  await speichereJson(svc, ZUORDNUNG_KEY, zuordnung);
}

/** Organisationen in Manatal (für die Zuordnung im Admin) */
export async function ladeManatalOrganisationen(): Promise<Array<{ id: number; name: string }>> {
  const out: Array<{ id: number; name: string }> = [];
  let url: string | null = '/organizations/?page_size=100';
  for (let i = 0; url && i < MAX_SEITEN; i++) {
    const seite: { results: Array<{ id: number; name: string }>; next: string | null } = await manatal(url);
    out.push(...seite.results.map((o) => ({ id: o.id, name: o.name })));
    url = seite.next;
  }
  return out;
}

/** Lebenslauf von Manatal laden und im Bucket candidate-resumes ablegen (best effort) */
async function speichereLebenslauf(svc: SupabaseClient, agencyId: string, k: ManatalKandidat): Promise<{ storagePath: string; mime: string; size: number } | null> {
  if (!k.resume) return null;
  try {
    const res = await fetch(k.resume, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const mime = res.headers.get('content-type')?.split(';')[0] || 'application/pdf';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return null;
    const endung = mime.includes('pdf') ? 'pdf' : mime.includes('word') ? 'docx' : 'bin';
    const pfad = `${agencyId}/${Date.now()}-manatal-${k.id}.${endung}`;
    const { error } = await svc.storage.from('candidate-resumes').upload(pfad, buf, { contentType: mime });
    return error ? null : { storagePath: pfad, mime, size: buf.length };
  } catch {
    return null;
  }
}

export interface AbgleichErgebnis {
  neu: number;
  ignoriert: number;
  fehler: number;
}

/** Neue Manatal-Bewerber abholen (läuft im Minuten-Tick, wenn MANATAL_API_TOKEN gesetzt ist) */
export async function holeManatalBewerber(svc: SupabaseClient, jetzt: Date = new Date()): Promise<AbgleichErgebnis> {
  const ergebnis: AbgleichErgebnis = { neu: 0, ignoriert: 0, fehler: 0 };
  if (!manatalAktiv()) return ergebnis;

  const stand = await ladeJson<{ seit: string; erledigt?: number[] }>(svc, CURSOR_KEY);
  if (!stand?.seit) {
    // Erster Lauf: keine alten Bewerber nachholen
    await speichereJson(svc, CURSOR_KEY, { seit: jetzt.toISOString(), erledigt: [] });
    return ergebnis;
  }

  const matches: ManatalMatch[] = [];
  let url: string | null = `/matches/?page_size=100&created_at__gte=${encodeURIComponent(stand.seit)}`;
  for (let i = 0; url && i < MAX_SEITEN; i++) {
    const seite: { results: ManatalMatch[]; next: string | null } = await manatal(url);
    matches.push(...seite.results);
    url = seite.next;
  }
  if (matches.length === 0) return ergebnis;

  const zuordnung = await ladeZuordnung(svc);
  const jobs = new Map<number, ManatalJob>();
  // Der Abruf ist „ab Stand“: Matches genau auf dem Stand kommen im nächsten Tick erneut → über ihre IDs überspringen
  const stand0 = { seit: stand.seit, erledigt: new Set(stand.erledigt ?? []) };
  let neu = { seit: stand0.seit, erledigt: new Set(stand0.erledigt) };
  const abhaken = (m: ManatalMatch) => {
    if (m.created_at > neu.seit) neu = { seit: m.created_at, erledigt: new Set([m.id]) };
    else if (m.created_at === neu.seit) neu.erledigt.add(m.id);
  };

  for (const m of offeneMatches(matches, stand0)) {
    const agencyId = zuordnung[String(m.organization)];
    if (!agencyId || GESPERRTE_KUNDEN.has(agencyId)) {
      ergebnis.ignoriert++;
      abhaken(m);
      continue;
    }
    // Schon übernommen (der Stand ist „ab“, der letzte Bewerber kommt im nächsten Tick erneut)
    const { count: schon } = await svc.from('applications').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId).eq('source_ref', `manatal:${m.id}`);
    if (schon) {
      abhaken(m);
      continue;
    }
    try {
      const k = await manatal<ManatalKandidat>(`/candidates/${m.candidate}/`);
      if (!jobs.has(m.job)) jobs.set(m.job, await manatal<ManatalJob>(`/jobs/${m.job}/`));
      const job = jobs.get(m.job)!;
      const telefon = manatalTelefon(k.phone_number);
      if (!telefon && !k.email) {
        ergebnis.ignoriert++;
      } else {
        const stelle = await findeStelle(svc, agencyId, job.position_name);
        if (!stelle) {
          await alarmAnAdmins(svc, {
            titel: '⚠️ Manatal-Bewerber ohne Stelle',
            text: `Für einen Manatal-Bewerber („${job.position_name ?? 'ohne Titel'}“) gibt es beim Kunden keine aktive Stelle. Bitte eine Stelle anlegen.`,
            agencyId,
          });
          ergebnis.fehler++;
        } else {
          const { data: ag } = await svc.from('agencies').select('settings').eq('id', agencyId).maybeSingle();
          const hinweis = ((ag as { settings: Record<string, unknown> | null } | null)?.settings ?? {}).indeed_whatsapp_hinweis !== false;
          const name = (k.full_name ?? '').trim();
          const r = await ingestApplication(svc, {
            agencyId,
            jobId: stelle.id,
            firstName: name.split(' ')[0] || 'Bewerber',
            lastName: name.split(' ').slice(1).join(' ') || null,
            phone: telefon,
            email: k.email,
            source: manatalQuelle(k),
            sourceRef: `manatal:${m.id}`,
            campaign: { stellentitel: job.position_name, manatal_job_id: m.job, manatal_kandidat_id: m.candidate },
            consentWhatsapp: hinweis,
            consentSource: hinweis ? 'indeed_anzeige_hinweis' : null,
            resume: await speichereLebenslauf(svc, agencyId, k),
          });
          if (r.candidateCreated) {
            await svc.from('candidates').update({ indeed_job_title: job.position_name }).eq('id', r.candidateId).eq('agency_id', agencyId);
            ergebnis.neu++;
          }
        }
      }
    } catch (err) {
      // Stand nicht über diesen Bewerber hinaus schieben → nächster Tick versucht es erneut
      console.error('[manatal] Bewerber nicht übernommen:', err);
      ergebnis.fehler++;
      break;
    }
    abhaken(m);
  }

  if (neu.seit !== stand0.seit || neu.erledigt.size !== stand0.erledigt.size) {
    await speichereJson(svc, CURSOR_KEY, { seit: neu.seit, erledigt: [...neu.erledigt] });
  }
  return ergebnis;
}

/** Noch nicht verarbeitete Matches in zeitlicher Reihenfolge (rein, testbar) */
export function offeneMatches(matches: ManatalMatch[], stand: { seit: string; erledigt: Set<number> }): ManatalMatch[] {
  return [...matches]
    .filter((m) => !(m.created_at <= stand.seit && stand.erledigt.has(m.id)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
}
