import type { SupabaseClient } from '@supabase/supabase-js';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';
import { kosten, monatAuswerten, monatsGrenzen, stundensatzAusWert, type Zeiteintrag } from './rechnen';

/**
 * Zeiterfassung – Datenbank-Zugriffe (Service-Client). Verträgt eine noch fehlende Tabelle:
 * dann `schema: false` bzw. leere Ergebnisse statt Fehler.
 */

export const SCHEMA_FEHLT = 'Datenbank-Änderung fehlt noch (Migration 20261016000480_zeiterfassung.sql)';
export const STUNDENSATZ_KEY = 'stundensatz_intern';
export const EINTRAG_SPALTEN = 'id, user_id, agency_id, taetigkeit, start, ende, minuten, notiz';

/** Tabelle/Spalte existiert (noch) nicht – Postgres 42P01/42703 bzw. PostgREST-Schema-Cache */
export function tabelleFehlt(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code ?? '')) return true;
  const msg = error.message ?? '';
  return /zeiteintraege/.test(msg) && /does not exist|schema cache/.test(msg);
}

export async function stundensatzLaden(svc: SupabaseClient): Promise<number> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', STUNDENSATZ_KEY).maybeSingle();
  return stundensatzAusWert((data as { wert: string } | null)?.wert);
}

/** Alle Einträge, die im Monat (Berlin) beginnen */
export async function eintraegeImMonat(svc: SupabaseClient, monat: string): Promise<{ schema: boolean; eintraege: Zeiteintrag[] }> {
  const { ab, bis } = monatsGrenzen(monat);
  const eintraege: Zeiteintrag[] = [];
  // Seitenweise lesen – PostgREST liefert höchstens 1000 Zeilen je Abfrage
  for (let von = 0; ; von += 1000) {
    const { data, error } = await svc
      .from('zeiteintraege')
      .select(EINTRAG_SPALTEN)
      .gte('start', ab)
      .lt('start', bis)
      .order('start')
      .range(von, von + 999);
    if (error) {
      if (tabelleFehlt(error)) return { schema: false, eintraege: [] };
      throw new Error(error.message);
    }
    eintraege.push(...((data ?? []) as Zeiteintrag[]));
    if (!data || data.length < 1000) break;
  }
  return { schema: true, eintraege };
}

export interface StundenProKunde {
  /** null = interne Zeit ohne Kunde */
  agencyId: string | null;
  minuten: number;
  /** minuten × interner Stundensatz (€) */
  kosten: number;
}

/**
 * Für Kontrollzentrum/Marge: Teamstunden je Kunde im Monat 'YYYY-MM' (Berlin), nur abgeschlossene Einträge.
 * Fehlt die Tabelle noch, kommt ein leeres Array. Stundensatz aus system_einstellungen 'stundensatz_intern' (Standard 35 €).
 */
export async function stundenProKunde(svc: SupabaseClient, monat: string, stundensatz?: number): Promise<StundenProKunde[]> {
  const [{ eintraege }, satz] = await Promise.all([
    eintraegeImMonat(svc, monat),
    stundensatz !== undefined ? Promise.resolve(stundensatz) : stundensatzLaden(svc),
  ]);
  return monatAuswerten(eintraege, satz).proKunde.map((k) => ({ agencyId: k.agencyId, minuten: k.minuten, kosten: kosten(k.minuten, satz) }));
}

export interface KundeKurz {
  id: string;
  name: string;
  mrr: number | null;
  phase: string | null;
}

/** Kunden zur Auswahl (ohne interne Agentur), beendete zuletzt */
export async function kundenListe(svc: SupabaseClient): Promise<KundeKurz[]> {
  const { data } = await svc
    .from('agencies')
    .select('id, name, mrr, fulfillment_phase')
    .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`)
    .order('name');
  const liste = ((data ?? []) as Array<{ id: string; name: string | null; mrr: number | null; fulfillment_phase: string | null }>).map((a) => ({
    id: a.id,
    name: a.name ?? 'Ohne Namen',
    mrr: a.mrr === null ? null : Number(a.mrr),
    phase: a.fulfillment_phase,
  }));
  const beendet = (k: KundeKurz) => (k.phase === 'beendet' ? 1 : 0);
  return liste.sort((a, b) => beendet(a) - beendet(b));
}

/** Laufende Stoppuhr eines Mitarbeiters (null = keine oder Tabelle fehlt) */
export async function laufendeStoppuhr(svc: SupabaseClient, userId: string): Promise<{ schema: boolean; eintrag: Zeiteintrag | null }> {
  const { data, error } = await svc.from('zeiteintraege').select(EINTRAG_SPALTEN).eq('user_id', userId).is('ende', null).maybeSingle();
  if (error) {
    if (tabelleFehlt(error)) return { schema: false, eintrag: null };
    throw new Error(error.message);
  }
  return { schema: true, eintrag: (data as Zeiteintrag | null) ?? null };
}
