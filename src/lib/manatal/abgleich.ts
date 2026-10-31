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
import { faelligeEintraege, legeAufPruefstand, meldeNeueOffene, schliessePruefstand } from '@/lib/zuordnung/pruefstand';

const BASE = 'https://api.manatal.com/open/v3';
const CURSOR_KEY = 'manatal_cursor';
export const ZUORDNUNG_KEY = 'manatal_zuordnung';
const MAX_SEITEN = 10;
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
  organization?: number | null;
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
  // „49 0155…“ (Ländervorwahl + führende 0) kommt bei Indeed vor → 0 weg, sonst greift die Dublettenprüfung nicht
  if (/^490\d{9,11}$/.test(s)) return `+49${s.slice(3)}`;
  if (/^49\d{9,12}$/.test(s)) return `+${s}`;
  return s;
}

/** Quelle aus dem Bewerbungsportal (rein, testbar). candidates.source erlaubt nur meta/indeed/manual/form/csv – Karriereseite u. Ä. = form */
export function manatalQuelle(k: Pick<ManatalKandidat, 'source_details'>): 'indeed' | 'form' {
  return /indeed/i.test(k.source_details?.portal?.display_name ?? '') ? 'indeed' : 'form';
}

/** Liest eine Einstellung. Lesefehler werfen (nie „leer“ annehmen – sonst würden Bewerber als nicht zugeordnet verworfen). */
async function ladeJson<T>(svc: SupabaseClient, key: string): Promise<T | null> {
  const { data, error } = await svc.from('system_einstellungen').select('wert').eq('key', key).maybeSingle();
  if (error) throw new Error(`Einstellung ${key} nicht lesbar: ${error.message}`);
  const w = (data as { wert: unknown } | null)?.wert;
  if (w == null) return null;
  return (typeof w === 'string' ? JSON.parse(w) : w) as T;
}

async function speichereJson(svc: SupabaseClient, key: string, wert: unknown): Promise<void> {
  const { error } = await svc.from('system_einstellungen').upsert({ key, wert: JSON.stringify(wert), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`Einstellung ${key} nicht gespeichert: ${error.message}`);
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

/** Zuordnungs-Prüfung vor jeder Übernahme – alle vier müssen stimmen, sonst wird der Bewerber nicht weitergegeben (rein, testbar) */
export interface ZuordnungsDaten {
  matchOrganisation: number;
  /** Kunde laut Zuordnung (Manatal-Firma → Kunde) */
  agencyId: string | undefined;
  /** Firma der Manatal-Stelle, auf die sich beworben wurde */
  jobOrganisation: number | null | undefined;
  /** Name der Manatal-Firma */
  orgName: string | null | undefined;
  /** Kunde in der Cloud */
  kunde: { id: string; name: string | null; contact_name: string | null } | null;
  /** Kunde der Cloud-Stelle, in die der Bewerber käme */
  stelleAgencyId: string | null | undefined;
}

function namensWoerter(n: string): Set<string> {
  const norm = n
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\(haftungsbeschränkt\)/g, ' ');
  const stop = new Set(['gmbh', 'haftungsbeschraenkt', 'vertrieb', 'vertriebs', 'direktvertrieb', 'sales', 'solutions', 'finanz', 'consulting', 'gruppe', 'group']);
  return new Set(norm.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !stop.has(w)));
}

/**
 * Passt der Name der Manatal-Firma zum Kunden (Firmen- oder Ansprechpartnername)?
 * Gleich/enthalten – oder JEDES markante Wort der Manatal-Firma findet sich beim Kunden (Rudi ≈ Rudolf über gleichen Anfang).
 * Ein gemeinsamer Nachname allein reicht nicht (Ömer Bilge ≠ Kadri Bilge).
 */
export function nameStimmt(orgName: string, kunde: { name: string | null; contact_name: string | null }): boolean {
  const o = normName(orgName);
  const ow = [...namensWoerter(orgName)];
  const aehnlich = (a: string, b: string) => a === b || (a.slice(0, 3) === b.slice(0, 3) && Math.abs(a.length - b.length) <= 3);
  for (const k of [kunde.name, kunde.contact_name]) {
    if (!k) continue;
    const n = normName(k);
    if (n.length >= 4 && o.length >= 4 && (o === n || o.includes(n) || n.includes(o))) return true;
    const kw = [...namensWoerter(k)];
    if (ow.length && ow.every((w) => kw.some((x) => aehnlich(w, x)))) return true;
  }
  return false;
}

export function pruefeZuordnung(d: ZuordnungsDaten): string[] {
  const fehler: string[] = [];
  // 1. Feste Zuordnung Manatal-Firma → Kunde vorhanden und Kunde nicht gesperrt
  if (!d.agencyId || GESPERRTE_KUNDEN.has(d.agencyId) || !d.kunde || d.kunde.id !== d.agencyId) fehler.push('Keine gültige Zuordnung Manatal-Firma → Kunde');
  // 2. Die Manatal-Stelle gehört wirklich zu dieser Manatal-Firma
  if (d.jobOrganisation == null || d.jobOrganisation !== d.matchOrganisation) fehler.push('Manatal-Stelle gehört zu einer anderen Firma');
  // 3. Name der Manatal-Firma passt zum Kunden
  if (!d.orgName || !d.kunde || !nameStimmt(d.orgName, d.kunde)) fehler.push(`Firmenname „${d.orgName ?? '?'}“ passt nicht zu Kunde „${d.kunde?.name ?? '?'}“`);
  // 4. Die Cloud-Stelle gehört zu genau diesem Kunden
  if (!d.stelleAgencyId || d.stelleAgencyId !== d.agencyId) fehler.push('Cloud-Stelle gehört nicht zu diesem Kunden');
  return fehler;
}

/** Alte Klärliste (vor dem Prüfstand) – wird beim ersten Lauf auf den Prüfstand übertragen */
const KLAERFAELLE_KEY = 'manatal_klaerfaelle';
const LETZTER_LAUF_KEY = 'manatal_letzter_lauf';

/** Manatal-Firmen, die bewusst nie in die Zoepp Cloud kommen (B&C läuft über die eigene B&C-Cloud) */
export const IGNORIERTE_ORGANISATIONEN = new Set([8236648]);
const ZEITBUDGET_MS = 25_000;

type MatchErgebnis =
  | { art: 'neu' | 'schon'; agencyId: string; candidateId: string | null }
  | { art: 'pruefstand'; status: 'wartet' | 'offen'; gruende: string[]; agencyId: string | null; name: string | null; naechsterMin: number };

interface Caches {
  zuordnung: Record<string, string>;
  jobs: Map<number, ManatalJob>;
  orgs: Map<number, string | null>;
  kunden: Map<string, { id: string; name: string | null; contact_name: string | null; settings: Record<string, unknown> | null } | null>;
}

/** Bewerbung jünger als die Wartezeit? (rein, testbar) */
export function nochJung(erstellt: string, jetzt: Date, minuten: number): boolean {
  return jetzt.getTime() - Date.parse(erstellt) < minuten * 60_000;
}

/**
 * Einen Manatal-Match prüfen und – nur wenn alles belegt ist – übernehmen. Wirft bei API-/DB-Fehlern (→ später erneut).
 * freigabe: Admin hat den Kunden auf dem Prüfstand bestätigt → Kunde aus der Freigabe, kein Beleg nötig (Stelle muss trotzdem zum Kunden gehören).
 */
async function verarbeiteMatch(svc: SupabaseClient, m: ManatalMatch, c: Caches, jetzt: Date, freigabe?: { agencyId: string; von: string }): Promise<MatchErgebnis> {
  const agencyId = freigabe?.agencyId ?? c.zuordnung[String(m.organization)] ?? null;
  if (agencyId) {
    const { data: schon } = await svc.from('applications').select('candidate_id').eq('agency_id', agencyId).eq('source_ref', `manatal:${m.id}`).limit(1).maybeSingle();
    if (schon) return { art: 'schon', agencyId, candidateId: (schon as { candidate_id: string }).candidate_id };
  }
  const k = await manatal<ManatalKandidat>(`/candidates/${m.candidate}/`);
  if (!c.jobs.has(m.job)) c.jobs.set(m.job, await manatal<ManatalJob>(`/jobs/${m.job}/`));
  const job = c.jobs.get(m.job)!;
  const name = (k.full_name ?? '').trim() || null;
  const ps = (status: 'wartet' | 'offen', grund: string, naechsterMin: number): MatchErgebnis => ({ art: 'pruefstand', status, gruende: [grund], agencyId, name, naechsterMin });

  const telefon = manatalTelefon(k.phone_number);
  // Manatal liest Telefon/E-Mail erst 1–2 Minuten nach der Bewerbung aus dem Lebenslauf → warten statt überspringen
  if (!telefon && !k.email) {
    return aufKontaktWarten(m.created_at, jetzt) ? ps('wartet', 'Wartet auf Telefon/E-Mail aus Manatal', 1) : ps('offen', 'Weder Telefon noch E-Mail – in Indeed nachsehen', 60);
  }
  if (!c.orgs.has(m.organization)) c.orgs.set(m.organization, (await manatal<{ name: string | null }>(`/organizations/${m.organization}/`)).name ?? null);
  if (agencyId && !c.kunden.has(agencyId)) {
    const { data } = await svc.from('agencies').select('id, name, contact_name, settings').eq('id', agencyId).maybeSingle();
    c.kunden.set(agencyId, (data as never) ?? null);
  }
  const kunde = agencyId ? c.kunden.get(agencyId) ?? null : null;
  if (!agencyId) return ps('offen', `Manatal-Firma „${c.orgs.get(m.organization) ?? m.organization}“ ist keinem Kunden zugeordnet`, 10);
  const stelle = await findeStelle(svc, agencyId, job.position_name);
  if (!stelle) return ps('offen', `Keine aktive Stelle beim Kunden für „${job.position_name ?? 'ohne Titel'}“`, 10);
  const { data: stelleRow } = await svc.from('jobs').select('agency_id').eq('id', stelle.id).maybeSingle();
  const stelleAgencyId = (stelleRow as { agency_id: string } | null)?.agency_id;

  const pruefungen: string[] = [];
  if (freigabe) {
    if (stelleAgencyId !== agencyId) return ps('offen', 'Cloud-Stelle gehört nicht zu diesem Kunden', 10);
    pruefungen.push('Stelle gehört zum Kunden', `Freigabe durch Admin`);
  } else {
    // Boden 1: vier Prüfungen gegen die feste Zuordnung
    const fehler = pruefeZuordnung({
      matchOrganisation: m.organization,
      agencyId,
      jobOrganisation: job.organization,
      orgName: c.orgs.get(m.organization),
      kunde: kunde ? { id: kunde.id, name: kunde.name, contact_name: kunde.contact_name } : null,
      stelleAgencyId,
    });
    if (fehler.length) return { art: 'pruefstand', status: 'offen', gruende: fehler, agencyId, name, naechsterMin: 10 };
    pruefungen.push('Zuordnung Firma → Kunde', 'Manatal-Stelle gehört zur Firma', 'Firmenname passt', 'Stelle gehört zum Kunden');

    // Boden 2: feste, von einem Admin bestätigte Zuordnung der Manatal-Stellen-ID → genau dieser Kunde
    const { data: st, error: stFehler } = await svc.from('manatal_stellen').select('agency_id, manatal_organisation').eq('manatal_job_id', m.job).maybeSingle();
    if (stFehler) throw new Error(`Manatal-Stellen nicht lesbar: ${stFehler.message}`);
    const stZeile = st as { agency_id: string; manatal_organisation: number | null } | null;
    if (!stZeile) return ps('offen', `Manatal-Stelle „${job.position_name ?? m.job}“ (ID ${m.job}) ist noch keinem Kunden bestätigt – einmal mit dem Indeed-Konto abgleichen und bestätigen`, 10);
    if (stZeile.agency_id !== agencyId) {
      const { data: anderer } = await svc.from('agencies').select('name').eq('id', stZeile.agency_id).maybeSingle();
      return ps('offen', `Manatal-Stelle ${m.job} ist ${(anderer as { name: string } | null)?.name ?? 'einem anderen Kunden'} bestätigt, die Manatal-Firma aber ${kunde?.name ?? 'diesem Kunden'}`, 30);
    }
    if (stZeile.manatal_organisation != null && stZeile.manatal_organisation !== m.organization) return ps('offen', `Manatal-Stelle ${m.job} hängt jetzt an einer anderen Manatal-Firma als bei der Bestätigung`, 30);
    pruefungen.push(`Manatal-Stelle ${m.job} bestätigt für diesen Kunden`);
  }

  const hinweis = (kunde?.settings ?? {}).indeed_whatsapp_hinweis !== false;
  const r = await ingestApplication(svc, {
    agencyId,
    jobId: stelle.id,
    firstName: (name ?? '').split(' ')[0] || 'Bewerber',
    lastName: (name ?? '').split(' ').slice(1).join(' ') || null,
    phone: telefon,
    email: k.email,
    source: manatalQuelle(k),
    sourceRef: `manatal:${m.id}`,
    campaign: { stellentitel: job.position_name, manatal_job_id: m.job, manatal_kandidat_id: m.candidate, manatal_organisation: m.organization },
    consentWhatsapp: hinweis,
    consentSource: hinweis ? 'indeed_anzeige_hinweis' : null,
    resume: await speichereLebenslauf(svc, agencyId, k),
    // Freigabe vom Prüfstand kommt oft Stunden/Tage später → nichts automatisch verschicken
    ohneAutomatik: !!freigabe,
    nachweis: { quelle: 'manatal', match: m.id, pruefungen, freigabe_von: freigabe?.von ?? null, zeit: jetzt.toISOString() },
  });
  if (r.candidateCreated) await svc.from('candidates').update({ indeed_job_title: job.position_name }).eq('id', r.candidateId).eq('agency_id', agencyId);
  return { art: 'neu', agencyId, candidateId: r.candidateId };
}

async function leereCaches(svc: SupabaseClient): Promise<Caches> {
  return { zuordnung: await ladeZuordnung(svc), jobs: new Map(), orgs: new Map(), kunden: new Map() };
}

async function aufPruefstand(svc: SupabaseClient, m: ManatalMatch, r: Extract<MatchErgebnis, { art: 'pruefstand' }>): Promise<void> {
  await legeAufPruefstand(svc, {
    quelle: 'manatal',
    externeRef: `manatal:${m.id}`,
    agencyVorschlag: r.agencyId,
    name: r.name,
    daten: { match: m.id, organisation: m.organization, job: m.job, kandidat: m.candidate, beworben_am: m.created_at },
    gruende: r.gruende,
    status: r.status,
    naechsterVersuchInMin: r.naechsterMin,
  });
}

/** Admin-Freigabe vom Prüfstand: Manatal-Bewerber an den gewählten Kunden übernehmen */
export async function uebernehmeManatalMatch(svc: SupabaseClient, matchId: number, agencyId: string, von: string): Promise<{ ok: true; candidateId: string | null } | { ok: false; grund: string }> {
  const c = await leereCaches(svc);
  const m = await manatal<ManatalMatch>(`/matches/${matchId}/`);
  const r = await verarbeiteMatch(svc, m, c, new Date(), { agencyId, von });
  if (r.art === 'pruefstand') return { ok: false, grund: r.gruende.join('; ') };
  await schliessePruefstand(svc, `manatal:${matchId}`, { agencyId, candidateId: r.candidateId, von });
  return { ok: true, candidateId: r.candidateId };
}

/** Neue Manatal-Bewerber abholen (läuft im Minuten-Tick, wenn MANATAL_API_TOKEN gesetzt ist) */
export async function holeManatalBewerber(svc: SupabaseClient, jetzt: Date = new Date()): Promise<AbgleichErgebnis> {
  const ergebnis: AbgleichErgebnis = { neu: 0, ignoriert: 0, fehler: 0 };
  if (!manatalAktiv()) return ergebnis;
  const ende = Date.now() + ZEITBUDGET_MS;

  const stand = await ladeJson<{ seit: string; erledigt?: number[] }>(svc, CURSOR_KEY);
  if (!stand?.seit) {
    // Erster Lauf überhaupt: keine alten Bewerber nachholen
    await speichereJson(svc, CURSOR_KEY, { seit: jetzt.toISOString(), erledigt: [] });
    return ergebnis;
  }
  const c = await leereCaches(svc);

  // Alte Klärliste einmalig auf den Prüfstand übertragen
  const alt = (await ladeJson<Array<{ match: number; grund: string }>>(svc, KLAERFAELLE_KEY)) ?? [];
  if (alt.length) {
    for (const f of alt) {
      await legeAufPruefstand(svc, { quelle: 'manatal', externeRef: `manatal:${f.match}`, agencyVorschlag: null, name: null, daten: { match: f.match }, gruende: [f.grund], status: 'wartet', naechsterVersuchInMin: 0 });
    }
    await speichereJson(svc, KLAERFAELLE_KEY, []);
  }

  // Prüfstand: fällige Einträge erneut prüfen (z. B. Beleg inzwischen da, Zuordnung/Stelle angelegt)
  for (const f of await faelligeEintraege(svc, 'manatal', 15)) {
    if (Date.now() > ende) break;
    const matchId = Number(f.externe_ref.replace('manatal:', ''));
    try {
      const m = await manatal<ManatalMatch>(`/matches/${matchId}/`);
      const r = await verarbeiteMatch(svc, m, c, jetzt);
      if (r.art === 'pruefstand') await aufPruefstand(svc, m, r);
      else {
        await schliessePruefstand(svc, f.externe_ref, { agencyId: r.agencyId, candidateId: r.candidateId });
        if (r.art === 'neu') ergebnis.neu++;
      }
    } catch (err) {
      // Einzelner Fehler (z. B. Kandidat in Manatal gelöscht) darf nichts blockieren: später erneut, nach 10 Versuchen zur Entscheidung
      console.error('[manatal] Prüfstand-Eintrag nicht geprüft:', f.externe_ref, err);
      ergebnis.fehler++;
      const grund = `Abruf-Fehler: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`;
      await legeAufPruefstand(svc, {
        quelle: 'manatal',
        externeRef: f.externe_ref,
        agencyVorschlag: f.agency_vorschlag,
        name: f.name,
        daten: f.daten,
        gruende: [grund],
        status: f.versuche >= 10 || f.status === 'offen' ? 'offen' : 'wartet',
        naechsterVersuchInMin: Math.min(120, 2 ** Math.min(f.versuche, 7)),
      });
    }
  }

  // Älteste zuerst laden, damit der Stand nie über nicht geladene Bewerber springt
  const matches: ManatalMatch[] = [];
  let url: string | null = `/matches/?page_size=100&ordering=created_at&created_at__gte=${encodeURIComponent(stand.seit)}`;
  for (let i = 0; url && i < MAX_SEITEN; i++) {
    const seite: { results: ManatalMatch[]; next: string | null } = await manatal(url);
    matches.push(...seite.results);
    url = seite.next;
  }

  // Der Abruf ist „ab Stand“: Matches genau auf dem Stand kommen im nächsten Tick erneut → über ihre IDs überspringen
  const stand0 = { seit: stand.seit, erledigt: new Set(stand.erledigt ?? []) };
  let neu = { seit: stand0.seit, erledigt: new Set(stand0.erledigt) };
  const abhaken = (m: ManatalMatch) => {
    if (m.created_at > neu.seit) neu = { seit: m.created_at, erledigt: new Set([m.id]) };
    else if (m.created_at === neu.seit) neu.erledigt.add(m.id);
  };
  const sichern = async () => {
    if (neu.seit !== stand0.seit || neu.erledigt.size !== stand0.erledigt.size) await speichereJson(svc, CURSOR_KEY, { seit: neu.seit, erledigt: [...neu.erledigt] });
  };

  let verarbeitet = 0;
  for (const m of offeneMatches(matches, stand0)) {
    if (Date.now() > ende) break;
    // Nur bewusst ausgeschlossene Firmen (B&C) still überspringen – alles andere ohne Zuordnung kommt auf den Prüfstand
    if (IGNORIERTE_ORGANISATIONEN.has(m.organization) || GESPERRTE_KUNDEN.has(c.zuordnung[String(m.organization)] ?? '')) {
      ergebnis.ignoriert++;
      abhaken(m);
      continue;
    }
    try {
      const r = await verarbeiteMatch(svc, m, c, jetzt);
      if (r.art === 'neu') ergebnis.neu++;
      // Nicht doppelt belegt → Prüfstand; der Stand läuft für alle anderen Kunden weiter
      if (r.art === 'pruefstand') {
        if (r.status === 'offen') ergebnis.fehler++;
        await aufPruefstand(svc, m, r);
      }
    } catch (err) {
      // Bewerber auf den Prüfstand (wird dort wiederholt) – der Stand läuft für alle anderen weiter.
      // Klappt nicht einmal das (Datenbank weg), Stand NICHT verschieben → nächster Tick versucht es erneut.
      console.error('[manatal] Bewerber nicht übernommen:', err);
      ergebnis.fehler++;
      try {
        await legeAufPruefstand(svc, {
          quelle: 'manatal',
          externeRef: `manatal:${m.id}`,
          agencyVorschlag: c.zuordnung[String(m.organization)] ?? null,
          name: null,
          daten: { match: m.id, organisation: m.organization, job: m.job, kandidat: m.candidate, beworben_am: m.created_at },
          gruende: [`Abruf-Fehler: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`],
          status: 'wartet',
          naechsterVersuchInMin: 2,
        });
      } catch {
        break;
      }
    }
    abhaken(m);
    // Stand laufend sichern: bricht ein langer Lauf ab, geht der Fortschritt nicht verloren
    if (++verarbeitet % 5 === 0) await sichern();
  }

  await sichern();
  await meldeNeueOffene(svc);
  await speichereJson(svc, LETZTER_LAUF_KEY, { zeit: jetzt.toISOString(), ...ergebnis });
  return ergebnis;
}

export const KONTAKT_WARTEZEIT_MIN = 30;

/** Fehlen noch Kontaktdaten, solange die Bewerbung jünger als die Wartezeit ist → warten statt überspringen (rein, testbar) */
export function aufKontaktWarten(matchErstellt: string, jetzt: Date): boolean {
  return jetzt.getTime() - Date.parse(matchErstellt) < KONTAKT_WARTEZEIT_MIN * 60_000;
}

/** Noch nicht verarbeitete Matches in zeitlicher Reihenfolge (rein, testbar) */
export function offeneMatches(matches: ManatalMatch[], stand: { seit: string; erledigt: Set<number> }): ManatalMatch[] {
  return [...matches]
    .filter((m) => !(m.created_at <= stand.seit && stand.erledigt.has(m.id)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
}
