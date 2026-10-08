/**
 * Zahlungserkennung für Kunden aus dem neuen Ablauf (mit Vertragsbestätigung):
 * Die Buchhaltung schreibt die Setup-Rechnung von Hand in Lexware. Die Cloud findet sie in der
 * Lexware-Rechnungsliste (Kontakt des Kunden, Rechnungsdatum ≥ Vertragsbestätigung; Namensabgleich
 * als Rückfall) und startet das Onboarding, sobald Lexware sie als bezahlt führt (Abgleich mit Qonto).
 * Bestandskunden haben keine Zeile in vertraege und bleiben unberührt.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { passtZu } from '@/lib/billing/rechnungsliste';
import { setStepStatus } from '@/lib/fulfillment/engine';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';
import { sendZahlungEingegangen } from '@/lib/email/resend';

/** Höchstens alle 15 Minuten bei Lexware nachfragen (Tick läuft minütlich, Lexware hat ein Rate-Limit) */
export const ZAHLUNGSCHECK_INTERVALL_MS = 15 * 60 * 1000;
const CHECK_KEY = 'setup_zahlungscheck_am';
const BEZAHLT = ['paid', 'paidoff'];

export interface LexRechnung {
  id: string;
  voucherNumber: string | null;
  voucherStatus: string;
  voucherDate: string;
  contactId?: string | null;
  contactName: string;
  totalAmount?: number;
}

export interface ZahlungDeps {
  /** Neueste Rechnungen aus Lexware (offen/bezahlt) */
  ladeRechnungen: () => Promise<LexRechnung[]>;
  sendZahlungEingegangen: typeof sendZahlungEingegangen;
}

async function ladeLexRechnungen(): Promise<LexRechnung[]> {
  const key = process.env.LEXOFFICE_API_KEY;
  if (!key) throw new Error('LEXOFFICE_API_KEY nicht konfiguriert');
  const res = await fetch(
    'https://api.lexoffice.io/v1/voucherlist?voucherType=invoice&voucherStatus=open,paid,paidoff,voided&size=250&sort=voucherDate,DESC',
    { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } },
  );
  if (!res.ok) throw new Error(`Lexware-Rechnungsliste: ${res.status}`);
  const { content } = (await res.json()) as { content?: LexRechnung[] };
  return content ?? [];
}

const defaultDeps: ZahlungDeps = { ladeRechnungen: ladeLexRechnungen, sendZahlungEingegangen };

/** Kalendertag in Berlin (YYYY-MM-DD) */
const tagBerlin = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

interface OffenerVertrag {
  id: string;
  agency_id: string;
  bestaetigt_am: string;
  setup_rechnung_id: string | null;
  setup_rechnung_status: string | null;
}

/** Passende Setup-Rechnung zu einem Kunden: früheste Rechnung ab dem Tag der Vertragsbestätigung */
export function findeSetupRechnung(
  rechnungen: LexRechnung[],
  kunde: { name: string; lex_contact_id: string | null; bestaetigt_am: string },
): LexRechnung | null {
  const ab = tagBerlin(kunde.bestaetigt_am);
  const treffer = rechnungen
    .filter((r) => r.voucherStatus !== 'voided' && r.voucherDate.slice(0, 10) >= ab)
    .filter((r) => (kunde.lex_contact_id ? r.contactId === kunde.lex_contact_id : passtZu(kunde.name, r.contactName)))
    .sort((a, b) => a.voucherDate.localeCompare(b.voucherDate));
  return treffer[0] ?? null;
}

/**
 * Zahlung erkannt: Schritt „Erste Zahlung eingegangen" abhaken (Engine startet dann das Onboarding),
 * Team informieren, Kunde bekommt „So geht's weiter". Idempotent über setup_bezahlt_am.
 */
export async function setupZahlungEingegangen(
  svc: SupabaseClient,
  vertragId: string,
  agencyId: string,
  rechnungNr: string | null,
  deps: Pick<ZahlungDeps, 'sendZahlungEingegangen'> = defaultDeps,
  now: Date = new Date(),
): Promise<boolean> {
  const { data: moved } = await svc
    .from('vertraege')
    .update({ setup_bezahlt_am: now.toISOString(), setup_rechnung_status: 'paid' })
    .eq('id', vertragId)
    .is('setup_bezahlt_am', null)
    .select('id');
  if (!((moved ?? []) as unknown[]).length) return false;

  const nr = rechnungNr ? ` (${rechnungNr})` : '';
  // Schritt „Erste Rechnung geschrieben" ist damit offensichtlich auch erledigt
  for (const key of ['z_rechnung_setup', 'z_zahlung_setup']) {
    const { data } = await svc
      .from('client_steps')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('step_key', key)
      .not('status', 'in', '(erledigt,nicht_noetig)')
      .maybeSingle();
    const step = data as { id: string } | null;
    if (step) {
      await setStepStatus(svc, step.id, 'erledigt', {
        kommentar: key === 'z_zahlung_setup' ? `Zahlung in Lexware erkannt${nr}` : `Rechnung in Lexware gefunden${nr}`,
        now,
      });
    }
  }

  const { data: a } = await svc.from('agencies').select('name, contact_name, email').eq('id', agencyId).maybeSingle();
  const agency = a as { name: string; contact_name: string | null; email: string | null } | null;
  const firma = agency?.name ?? 'Kunde';

  await logActivity(svc, {
    agency_id: agencyId,
    user_id: null,
    action: `Zahlung eingegangen${nr} – Onboarding gestartet`,
    action_type: 'zahlung_eingegangen',
    metadata: { rechnung: rechnungNr },
  }).catch(() => {});
  await createNotificationForInternals(svc, {
    title: `Zahlung eingegangen: ${firma}`,
    body: `Setup-Rechnung${nr} ist bezahlt – das Onboarding ist gestartet.`,
    type: 'system',
    entity_type: 'agency',
    entity_id: agencyId,
  }).catch(() => {});

  if (agency?.email) {
    try {
      const base = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';
      const { weiterUrl } = await import('./bestaetigen');
      const url = await weiterUrl(svc, agencyId, agency.email, now);
      const neuerZugang = url.includes('/register/');
      await deps.sendZahlungEingegangen(agency.email, agency.contact_name || firma, neuerZugang ? url : `${base}/deine-aufgaben`, neuerZugang);
    } catch (err) {
      console.error('[setup-zahlung] Mail an Kunden fehlgeschlagen:', err);
      await createNotificationForInternals(svc, {
        title: `Mail „Zahlung eingegangen" nicht zugestellt: ${firma}`,
        body: 'Bitte den Kunden kurz selbst informieren, dass das Onboarding startet.',
        type: 'system',
        entity_type: 'agency',
        entity_id: agencyId,
      }).catch(() => {});
    }
  }
  return true;
}

/** Rechnung am Vertrag merken (Status nachziehen) und bei „bezahlt" das Onboarding starten */
async function uebernehmeRechnung(
  svc: SupabaseClient,
  v: OffenerVertrag,
  r: LexRechnung,
  deps: ZahlungDeps,
  now: Date,
): Promise<boolean> {
  if (v.setup_rechnung_id !== r.id || v.setup_rechnung_status !== r.voucherStatus) {
    await svc
      .from('vertraege')
      .update({ setup_rechnung_id: r.id, setup_rechnung_nummer: r.voucherNumber, setup_rechnung_status: r.voucherStatus })
      .eq('id', v.id);
  }
  if (BEZAHLT.includes(r.voucherStatus)) {
    return setupZahlungEingegangen(svc, v.id, v.agency_id, r.voucherNumber, deps, now);
  }
  return false;
}

/** Für den Minuten-Tick, intern auf alle 15 Minuten gedrosselt. */
export async function pruefeSetupZahlungen(
  svc: SupabaseClient,
  now: Date = new Date(),
  deps: ZahlungDeps = defaultDeps,
): Promise<{ offen: number; gefunden: number; bezahlt: number; uebersprungen?: boolean }> {
  const { data: zuletzt } = await svc.from('system_einstellungen').select('wert').eq('key', CHECK_KEY).maybeSingle();
  const letzter = Date.parse((zuletzt as { wert?: string } | null)?.wert ?? '');
  if (Number.isFinite(letzter) && now.getTime() - letzter < ZAHLUNGSCHECK_INTERVALL_MS) {
    return { offen: 0, gefunden: 0, bezahlt: 0, uebersprungen: true };
  }
  await svc
    .from('system_einstellungen')
    .upsert({ key: CHECK_KEY, wert: now.toISOString(), updated_at: now.toISOString() }, { onConflict: 'key' });

  const { data } = await svc
    .from('vertraege')
    .select('id, agency_id, bestaetigt_am, setup_rechnung_id, setup_rechnung_status')
    .eq('status', 'bestaetigt')
    .is('setup_bezahlt_am', null)
    .order('bestaetigt_am', { ascending: true })
    .limit(50);
  const offen = (data ?? []) as OffenerVertrag[];
  if (!offen.length) return { offen: 0, gefunden: 0, bezahlt: 0 };

  const { data: ag } = await svc.from('agencies').select('id, name, lex_contact_id, automatik').in('id', offen.map((v) => v.agency_id));
  // Nur Automatik-Kunden (agencies.automatik) – die neue Strecke greift nicht bei Bestandskunden
  const agencies = new Map(
    ((ag ?? []) as Array<{ id: string; name: string; lex_contact_id: string | null; automatik?: boolean }>)
      .filter((a) => a.automatik === true)
      .map((a) => [a.id, a]),
  );

  const rechnungen = await deps.ladeRechnungen();
  let gefunden = 0;
  let bezahlt = 0;
  for (const v of offen) {
    try {
      const kunde = agencies.get(v.agency_id);
      if (!kunde) continue;
      const r = v.setup_rechnung_id
        ? rechnungen.find((x) => x.id === v.setup_rechnung_id) ?? null
        : findeSetupRechnung(rechnungen, { name: kunde.name, lex_contact_id: kunde.lex_contact_id, bestaetigt_am: v.bestaetigt_am });
      if (!r) continue;
      gefunden++;
      // Über den Namen gefunden → Kontakt verknüpfen, ab dann wird exakt über den Kontakt gesucht
      if (!kunde.lex_contact_id && r.contactId) {
        await svc.from('agencies').update({ lex_contact_id: r.contactId }).eq('id', kunde.id);
      }
      if (r.voucherStatus === 'voided') {
        await svc.from('vertraege').update({ setup_rechnung_status: 'voided' }).eq('id', v.id);
        continue;
      }
      if (await uebernehmeRechnung(svc, v, r, deps, now)) bezahlt++;
    } catch (err) {
      console.error('[setup-zahlung] Prüfung fehlgeschlagen:', v.agency_id, err);
    }
  }
  return { offen: offen.length, gefunden, bezahlt };
}

/** Von Hand: Lexware-Rechnungsnummer am Kunden verknüpfen, wenn die Automatik nichts findet. */
export async function verknuepfeSetupRechnung(
  svc: SupabaseClient,
  agencyId: string,
  nummer: string,
  deps: ZahlungDeps = defaultDeps,
  now: Date = new Date(),
): Promise<{ ok: true; status: string; bezahlt: boolean } | { ok: false; fehler: string }> {
  const nr = nummer.trim();
  if (!nr) return { ok: false, fehler: 'Bitte eine Rechnungsnummer eintragen.' };
  const { data } = await svc
    .from('vertraege')
    .select('id, agency_id, bestaetigt_am, setup_rechnung_id, setup_rechnung_status, status')
    .eq('agency_id', agencyId)
    .maybeSingle();
  const v = data as (OffenerVertrag & { status: string }) | null;
  if (!v) return { ok: false, fehler: 'Dieser Kunde läuft nicht über die Vertragsbestätigung in der Cloud.' };

  const r = (await deps.ladeRechnungen()).find((x) => (x.voucherNumber ?? '').toLowerCase() === nr.toLowerCase());
  if (!r) return { ok: false, fehler: `Rechnung ${nr} nicht unter den letzten 250 Lexware-Rechnungen gefunden.` };

  if (r.contactId) {
    const { data: a } = await svc.from('agencies').select('lex_contact_id').eq('id', agencyId).maybeSingle();
    if (!(a as { lex_contact_id?: string | null } | null)?.lex_contact_id) {
      await svc.from('agencies').update({ lex_contact_id: r.contactId }).eq('id', agencyId);
    }
  }
  const bezahlt = await uebernehmeRechnung(svc, { ...v, setup_rechnung_id: null, setup_rechnung_status: null }, r, deps, now);
  return { ok: true, status: r.voucherStatus, bezahlt };
}
