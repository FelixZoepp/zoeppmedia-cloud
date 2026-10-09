/**
 * Kunden-Abgleich Cloud → Close (täglich, Job sales.kunden_sync ab 7 Uhr). Die Cloud ist die Quelle.
 * - Aktiver Kunde → Lead-Status „Kunde“
 * - Offboarding/beendet → Lead-Status „Ex-Kunde“, „Gesperrt bis“ = Ende + 3 Monate (dann im „💳 Ex Kunde Follow Up“)
 * - Upsell-Potenzial: Zufriedenheit (Schnitt der letzten 2 Umfragen) ≥ 8/10 + gute Ergebnisse
 *   (Einstellung in 30 Tagen oder ≥ 10 Bewerber) + mindestens eine passende Leistung aus dem Upsell-Booster
 *   → Lead-Felder „Upsell-Potenzial = Ja“ + „Upsell-Empfehlung“, beim ersten Mal eine Notiz an den Lead.
 * Zuordnung Kunde → Lead: gemerkt, E-Mail, Rechnungsmail, Telefon, Name (nur eindeutige Treffer). Stand je Kunde in kunden_close_sync.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { findCloseLeadId, findCloseLeadIdByName } from './close';
import { SALES_AGENCY_ID } from './calendly-chain';
import { ladeEmpfehlungen } from '@/lib/empfehlungen/laden';
import { berlinTag } from '@/lib/zeit/berlin';

const CLOSE_BASE = 'https://api.close.com/api/v1';
const LEAD_STATUS_KUNDE = 'stat_p7s3wz4JnH4ftamYyGTIHf8I3Gy9fBuxqhIfKufqmGG';
const GESPERRT_BIS = 'cf_ivdENLjTV0OBF9z2It0W5CikYZMBZbE54BgcbINdO9S';
const INAKTIV = ['offboarding', 'beendet'];
export const UPSELL_MIN_ZUFRIEDENHEIT = 8;

function headers(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}

async function close<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLOSE_BASE}${path}`, { ...init, headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${init?.method ?? 'GET'} ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export interface CloseKundenIds {
  statusExKunde: string;
  feldUpsell: string;
  feldUpsellEmpfehlung: string;
}

/** Lead-Status „Ex-Kunde“ und Lead-Felder „Upsell-Potenzial“/„Upsell-Empfehlung“ sicherstellen */
export async function stelleCloseKundenFelderSicher(svc: SupabaseClient): Promise<CloseKundenIds> {
  const { data: status } = await close<{ data: Array<{ id: string; label: string }> }>(`/status/lead/`);
  const statusExKunde = status.find((s) => s.label.trim() === 'Ex-Kunde')?.id ?? (await close<{ id: string }>(`/status/lead/`, { method: 'POST', body: JSON.stringify({ label: 'Ex-Kunde' }) })).id;

  const { data: felder } = await close<{ data: Array<{ id: string; name: string }> }>(`/custom_field/lead/?_limit=500`);
  const feld = async (name: string, body: Record<string, unknown>) =>
    felder.find((f) => f.name.trim() === name)?.id ?? (await close<{ id: string }>(`/custom_field/lead/`, { method: 'POST', body: JSON.stringify({ name, ...body }) })).id;
  const ids: CloseKundenIds = {
    statusExKunde,
    feldUpsell: await feld('Upsell-Potenzial', { type: 'choices', choices: ['Ja'], accepts_multiple_values: false }),
    feldUpsellEmpfehlung: await feld('Upsell-Empfehlung', { type: 'text' }),
  };
  await svc.from('system_einstellungen').upsert({ key: 'close_kunden_ids', wert: JSON.stringify(ids), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return ids;
}

/** Zufriedenheit eines Kunden: Schnitt der letzten 2 Umfragen, umgerechnet auf 1–10 (Gesamtnote 1–5 × 2), null ohne Umfrage */
export function zufriedenheit(antworten: Array<{ rating: number | null; answers: Record<string, unknown> | null }>): number | null {
  const noten = antworten
    .map((r) => {
      // Gesamtnote 1–5 (Frage „overall“) → Skala 1–10
      if (typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5) return r.rating * 2;
      const overall = r.answers?.overall;
      return typeof overall === 'number' && overall >= 1 && overall <= 5 ? overall * 2 : null;
    })
    .filter((n): n is number => n !== null)
    .slice(0, 2);
  return noten.length ? Math.round((noten.reduce((a, b) => a + b, 0) / noten.length) * 10) / 10 : null;
}

/** Upsell-Entscheidung (rein, testbar) */
export function upsell(z: number | null, ergebnis: { einstellungen30: number; bewerber30: number }, leistungen: string[]): { ja: boolean; grund: string } {
  if (z === null) return { ja: false, grund: 'keine Zufriedenheitsumfrage' };
  if (z < UPSELL_MIN_ZUFRIEDENHEIT) return { ja: false, grund: `Zufriedenheit ${z}/10` };
  if (ergebnis.einstellungen30 < 1 && ergebnis.bewerber30 < 10) return { ja: false, grund: 'Ergebnisse noch zu schwach' };
  if (!leistungen.length) return { ja: false, grund: 'keine passende Leistung' };
  return { ja: true, grund: `Zufriedenheit ${z}/10, ${ergebnis.einstellungen30} Einstellungen / ${ergebnis.bewerber30} Bewerber in 30 Tagen` };
}

/** Tick: einmal täglich ab 7 Uhr planen */
export async function planeKundenSync(svc: SupabaseClient, jetzt: Date = new Date()): Promise<void> {
  const stunde = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).formatToParts(jetzt).find((x) => x.type === 'hour')?.value ?? 0);
  if (stunde < 7) return;
  const tag = berlinTag(jetzt);
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.kunden_sync',
    run_at: jetzt.toISOString(),
    payload: { tag },
    status: 'pending',
    dedupe_key: `sales.kunden_sync:${tag}`,
  });
  if (error && error.code !== '23505') console.error('[kunden-sync] nicht geplant:', error.message);
}

interface Kunde {
  id: string;
  name: string;
  phone: string | null;
  contact_name: string | null;
  email: string | null;
  rechnungsmail: string | null;
  fulfillment_phase: string | null;
  fulfillment_phase_seit: string | null;
}

/** Job sales.kunden_sync */
export async function synchronisiereKunden(svc: SupabaseClient, jetzt: Date = new Date(), opts: { nachId?: string | null; deadline?: number } = {}) {
  // Zeitbudget: höchstens 35 s und nie über die Restzeit des Minuten-Ticks hinaus
  const ende = Math.min(Date.now() + 35_000, opts.deadline ?? Infinity);
  const ids = await stelleCloseKundenFelderSicher(svc);
  const { data } = await svc.from('agencies').select('id, name, email, rechnungsmail, phone, contact_name, fulfillment_phase, fulfillment_phase_seit').neq('id', SALES_AGENCY_ID).not('fulfillment_phase', 'is', null);
  // Feste Reihenfolge, damit ein Folge-Job dort weitermacht, wo die Zeit nicht gereicht hat
  const kunden = ((data ?? []) as Kunde[]).sort((a, b) => a.id.localeCompare(b.id)).filter((k) => !opts.nachId || k.id > opts.nachId);
  const { data: stand } = await svc.from('kunden_close_sync').select('agency_id, lead_id, upsell, ex_kunde');
  const vorher = new Map(((stand ?? []) as Array<{ agency_id: string; lead_id: string | null; upsell: boolean; ex_kunde: boolean }>).map((s) => [s.agency_id, s]));
  const ergebnis = { abgeglichen: 0, ohneLead: [] as string[], exKunden: 0, upsell: 0, fehler: [] as string[], fortsetzung: false };

  for (const k of kunden) {
    // Zeitbudget erreicht: Folge-Job planen, der beim nächsten Kunden weitermacht
    if (Date.now() > ende) {
      const nachId = kunden[kunden.indexOf(k) - 1]?.id ?? null;
      if (!nachId) {
        // Kein Fortschritt in diesem Lauf (Budget schon vor dem ersten Kunden verbraucht) → nicht planen, morgen erneut
        console.error('[kunden-sync] Kein Zeitbudget für den ersten Kunden – Abbruch ohne Fortsetzung');
        break;
      }
      const { error: fErr } = await svc.from('scheduled_jobs').insert({
        agency_id: SALES_AGENCY_ID,
        type: 'sales.kunden_sync',
        run_at: new Date(Date.now() + 60_000).toISOString(),
        payload: { nach_id: nachId },
        status: 'pending',
        dedupe_key: `sales.kunden_sync:fortsetzung:${nachId}:${berlinTag(jetzt)}`,
      });
      if (fErr && fErr.code !== '23505') throw new Error(`Fortsetzung nicht geplant: ${fErr.message}`);
      ergebnis.fortsetzung = true;
      break;
    }
    try {
      // Zuordnung: gemerkter Lead → E-Mail → Rechnungsmail → Telefon (wird gemerkt) → Name (nur eindeutig, wird NICHT gemerkt)
      const sicher =
        vorher.get(k.id)?.lead_id ??
        (k.email ? await findCloseLeadId({ email: k.email }) : null) ??
        (k.rechnungsmail ? await findCloseLeadId({ email: k.rechnungsmail }) : null) ??
        (k.phone ? await findCloseLeadId({ phone: k.phone }) : null);
      const leadId =
        sicher ??
        (k.contact_name ? await findCloseLeadIdByName(k.contact_name).catch(() => null) : null) ??
        (await findCloseLeadIdByName(k.name).catch(() => null));
      if (!leadId) {
        ergebnis.ohneLead.push(k.name);
        continue;
      }
      const alt = vorher.get(k.id);
      const exKunde = INAKTIV.includes(k.fulfillment_phase ?? '');
      const update: Record<string, unknown> = {};
      let notiz: string | null = null;
      let up = { ja: false, grund: '' };
      let empfehlung: string | null = null;

      if (exKunde) {
        update.status_id = ids.statusExKunde;
        update[`custom.${ids.feldUpsell}`] = null;
        if (!alt?.ex_kunde) {
          const seit = k.fulfillment_phase_seit ?? jetzt.toISOString();
          const bis = new Date(seit);
          bis.setUTCMonth(bis.getUTCMonth() + 3);
          update[`custom.${GESPERRT_BIS}`] = bis.toISOString();
          notiz = `💳 Kunde ist in der Cloud „${k.fulfillment_phase}“ – Status „Ex-Kunde“. Follow-up durch den Kundenberater ab ${bis.toLocaleDateString('de-DE')}.`;
        }
        ergebnis.exKunden++;
      } else {
        update.status_id = LEAD_STATUS_KUNDE;
        const [{ data: umfragen }, empf] = await Promise.all([
          svc.from('survey_responses').select('rating, answers').eq('agency_id', k.id).order('created_at', { ascending: false }).limit(2),
          ladeEmpfehlungen(svc, k.id).catch(() => ({ lage: null, empfehlungen: [] })),
        ]);
        const leistungen = empf.empfehlungen.filter((e) => e.art === 'leistung').sort((a, b) => a.prio - b.prio);
        up = upsell(
          zufriedenheit((umfragen ?? []) as Array<{ rating: number | null; answers: Record<string, unknown> | null }>),
          { einstellungen30: empf.lage?.einstellungen30 ?? 0, bewerber30: empf.lage?.bewerber30 ?? 0 },
          leistungen.map((l) => l.titel),
        );
        empfehlung = up.ja ? leistungen.slice(0, 3).map((l) => l.titel).join(' · ') : null;
        update[`custom.${ids.feldUpsell}`] = up.ja ? 'Ja' : null;
        update[`custom.${ids.feldUpsellEmpfehlung}`] = empfehlung;
        if (up.ja && !alt?.upsell) {
          notiz = `🥩 Upsell-Potenzial: ${up.grund}. Empfehlung aus dem Upsell-Booster: ${leistungen
            .slice(0, 3)
            .map((l) => `${l.titel} (${l.warum})`)
            .join('; ')}.`;
        }
        if (up.ja) ergebnis.upsell++;
      }

      await close(`/lead/${leadId}/`, { method: 'PUT', body: JSON.stringify(update) });
      if (notiz) await close(`/activity/note/`, { method: 'POST', body: JSON.stringify({ lead_id: leadId, note: notiz }) }).catch(() => null);
      await svc.from('kunden_close_sync').upsert({
        agency_id: k.id,
        lead_id: sicher,
        ex_kunde: exKunde,
        upsell: up.ja,
        upsell_empfehlung: empfehlung,
        grund: exKunde ? null : up.grund,
        aktualisiert_am: jetzt.toISOString(),
      });
      ergebnis.abgeglichen++;
    } catch (err) {
      // Ein Fehler bei einem Kunden bricht nicht den ganzen Abgleich ab
      ergebnis.fehler.push(`${k.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return ergebnis;
}
