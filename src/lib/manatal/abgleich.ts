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

const KLAERFAELLE_KEY = 'manatal_klaerfaelle';
/** Offener Fall: wartet auf Kontaktdaten (warten) oder ist gesperrt bis zur Klärung. Wird regelmäßig erneut geprüft. */
interface Klaerfall { match: number; grund: string; seit: string; warten?: boolean }

/** Manatal-Firmen, die bewusst nie in die Zoepp Cloud kommen (B&C läuft über die eigene B&C-Cloud) */
export const IGNORIERTE_ORGANISATIONEN = new Set([8236648]);
const ZEITBUDGET_MS = 25_000;

type MatchErgebnis = { art: 'neu' | 'schon' | 'warten' } | { art: 'klaerfall'; grund: string };

interface Caches {
  zuordnung: Record<string, string>;
  jobs: Map<number, ManatalJob>;
  orgs: Map<number, string | null>;
  kunden: Map<string, { id: string; name: string | null; contact_name: string | null; settings: Record<string, unknown> | null } | null>;
}

/** Einen Manatal-Match prüfen und übernehmen. Wirft bei API-/DB-Fehlern (→ später erneut). */
async function verarbeiteMatch(svc: SupabaseClient, m: ManatalMatch, c: Caches, jetzt: Date): Promise<MatchErgebnis> {
  const agencyId = c.zuordnung[String(m.organization)];
  if (agencyId) {
    const { count: schon } = await svc.from('applications').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId).eq('source_ref', `manatal:${m.id}`);
    if (schon) return { art: 'schon' };
  }
  const k = await manatal<ManatalKandidat>(`/candidates/${m.candidate}/`);
  if (!c.jobs.has(m.job)) c.jobs.set(m.job, await manatal<ManatalJob>(`/jobs/${m.job}/`));
  const job = c.jobs.get(m.job)!;
  const telefon = manatalTelefon(k.phone_number);
  // Manatal liest Telefon/E-Mail erst 1–2 Minuten nach der Bewerbung aus dem Lebenslauf → warten statt überspringen
  if (!telefon && !k.email) {
    return aufKontaktWarten(m.created_at, jetzt) ? { art: 'warten' } : { art: 'klaerfall', grund: `Weder Telefon noch E-Mail nach ${KONTAKT_WARTEZEIT_MIN} Minuten` };
  }
  if (!c.orgs.has(m.organization)) c.orgs.set(m.organization, (await manatal<{ name: string | null }>(`/organizations/${m.organization}/`)).name ?? null);
  if (agencyId && !c.kunden.has(agencyId)) {
    const { data } = await svc.from('agencies').select('id, name, contact_name, settings').eq('id', agencyId).maybeSingle();
    c.kunden.set(agencyId, (data as never) ?? null);
  }
  const kunde = agencyId ? c.kunden.get(agencyId) ?? null : null;
  const stelle = agencyId ? await findeStelle(svc, agencyId, job.position_name) : null;
  if (agencyId && !stelle) return { art: 'klaerfall', grund: `Keine aktive Stelle beim Kunden für „${job.position_name ?? 'ohne Titel'}“` };
  const { data: stelleRow } = stelle ? await svc.from('jobs').select('agency_id').eq('id', stelle.id).maybeSingle() : { data: null };
  const fehler = pruefeZuordnung({
    matchOrganisation: m.organization,
    agencyId,
    jobOrganisation: job.organization,
    orgName: c.orgs.get(m.organization),
    kunde: kunde ? { id: kunde.id, name: kunde.name, contact_name: kunde.contact_name } : null,
    stelleAgencyId: (stelleRow as { agency_id: string } | null)?.agency_id,
  });
  if (fehler.length) return { art: 'klaerfall', grund: fehler.join('; ') };

  const hinweis = (kunde?.settings ?? {}).indeed_whatsapp_hinweis !== false;
  const name = (k.full_name ?? '').trim();
  const r = await ingestApplication(svc, {
    agencyId: agencyId!,
    jobId: stelle!.id,
    firstName: name.split(' ')[0] || 'Bewerber',
    lastName: name.split(' ').slice(1).join(' ') || null,
    phone: telefon,
    email: k.email,
    source: manatalQuelle(k),
    sourceRef: `manatal:${m.id}`,
    campaign: { stellentitel: job.position_name, manatal_job_id: m.job, manatal_kandidat_id: m.candidate, manatal_organisation: m.organization },
    consentWhatsapp: hinweis,
    consentSource: hinweis ? 'indeed_anzeige_hinweis' : null,
    resume: await speichereLebenslauf(svc, agencyId!, k),
  });
  if (r.candidateCreated) await svc.from('candidates').update({ indeed_job_title: job.position_name }).eq('id', r.candidateId).eq('agency_id', agencyId!);
  return { art: 'neu' };
}

async function meldeKlaerfaelle(svc: SupabaseClient, neu: Array<Klaerfall & { firma: string }>): Promise<void> {
  if (!neu.length) return;
  const liste = neu.slice(0, 8).map((f) => `Match ${f.match} (${f.firma}): ${f.grund}`).join(' | ');
  await alarmAnAdmins(svc, {
    titel: `⛔ ${neu.length} Manatal-Bewerber NICHT weitergegeben (${neu.map((f) => f.match).join(',').slice(0, 60)})`,
    text: `${liste}${neu.length > 8 ? ` | … und ${neu.length - 8} weitere` : ''}. Sie bleiben auf der Klärliste und werden alle 10 Minuten erneut geprüft.`,
  });
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

  const c: Caches = { zuordnung: await ladeZuordnung(svc), jobs: new Map(), orgs: new Map(), kunden: new Map() };
  const klaer = (await ladeJson<Klaerfall[]>(svc, KLAERFAELLE_KEY)) ?? [];
  let klaerGeaendert = false;
  const neueKlaer: Array<Klaerfall & { firma: string }> = [];
  const merke = (m: ManatalMatch, r: MatchErgebnis) => {
    const warten = r.art === 'warten';
    const grund = r.art === 'klaerfall' ? r.grund : 'Wartet auf Telefon/E-Mail aus Manatal';
    const alt = klaer.find((f) => f.match === m.id);
    if (alt) {
      // Aus „wartet“ wird ein echter Klärfall → jetzt melden
      if (alt.warten && !warten) {
        Object.assign(alt, { warten: false, grund });
        klaerGeaendert = true;
        neueKlaer.push({ ...alt, firma: c.orgs.get(m.organization) ?? String(m.organization) });
      }
      return;
    }
    const f: Klaerfall = { match: m.id, grund, seit: jetzt.toISOString(), warten };
    klaer.push(f);
    klaerGeaendert = true;
    if (!warten) neueKlaer.push({ ...f, firma: c.orgs.get(m.organization) ?? String(m.organization) });
  };

  // Offene Fälle erneut prüfen: wartende jede Minute, gesperrte alle 10 Minuten (z. B. nach neuer Zuordnung/Stelle)
  const alleZehn = jetzt.getUTCMinutes() % 10 === 7;
  for (const f of klaer.filter((x) => x.warten || alleZehn).slice(0, 15)) {
    if (Date.now() > ende) break;
    try {
      const m = await manatal<ManatalMatch>(`/matches/${f.match}/`);
      const r = await verarbeiteMatch(svc, m, c, jetzt);
      if (r.art === 'neu' || r.art === 'schon') {
        klaer.splice(klaer.findIndex((x) => x.match === f.match), 1);
        klaerGeaendert = true;
        if (r.art === 'neu') ergebnis.neu++;
      } else merke(m, r);
    } catch (err) {
      console.error('[manatal] Offener Fall nicht geprüft:', f.match, err);
      break;
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
    if (klaerGeaendert) await speichereJson(svc, KLAERFAELLE_KEY, klaer);
    klaerGeaendert = false;
    if (neu.seit !== stand0.seit || neu.erledigt.size !== stand0.erledigt.size) await speichereJson(svc, CURSOR_KEY, { seit: neu.seit, erledigt: [...neu.erledigt] });
  };

  let verarbeitet = 0;
  for (const m of offeneMatches(matches, stand0)) {
    if (Date.now() > ende) break;
    // Nur bewusst ausgeschlossene Firmen (B&C) still überspringen – alles andere ohne Zuordnung wird ein Klärfall mit Alarm
    if (IGNORIERTE_ORGANISATIONEN.has(m.organization) || GESPERRTE_KUNDEN.has(c.zuordnung[String(m.organization)] ?? '')) {
      ergebnis.ignoriert++;
      abhaken(m);
      continue;
    }
    try {
      const r = await verarbeiteMatch(svc, m, c, jetzt);
      if (r.art === 'neu') ergebnis.neu++;
      // Wartende und gesperrte Bewerber kommen auf die Liste offener Fälle – der Stand läuft für alle anderen Kunden weiter
      if (r.art === 'warten' || r.art === 'klaerfall') {
        if (r.art === 'klaerfall') ergebnis.fehler++;
        merke(m, r);
      }
    } catch (err) {
      // Stand nicht über diesen Bewerber hinaus schieben → nächster Tick versucht es erneut
      console.error('[manatal] Bewerber nicht übernommen:', err);
      ergebnis.fehler++;
      break;
    }
    abhaken(m);
    // Stand laufend sichern: bricht ein langer Lauf ab, geht der Fortschritt nicht verloren
    if (++verarbeitet % 5 === 0) await sichern();
  }

  await sichern();
  await meldeKlaerfaelle(svc, neueKlaer);
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
