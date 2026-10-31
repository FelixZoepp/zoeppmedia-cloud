/**
 * Prüfstand für Bewerber, deren Kunde nicht doppelt belegt ist.
 * Solche Bewerber gehen NIE an einen Kunden, sondern warten hier:
 *  - status „wartet“: auf einen Beleg/Kontaktdaten – wird automatisch erneut geprüft
 *  - status „offen“: braucht eine Entscheidung (Admin → /admin/pruefstand: freigeben an Kunde X oder verwerfen)
 * Entschiedene Einträge (freigegeben/verworfen) werden nie wieder überschrieben.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { alarmAnAdmins } from '@/lib/ops/alarm';

export type PruefstandQuelle = 'manatal' | 'perspective' | 'meta' | 'indeed_mail';

export interface PruefstandEintrag {
  id: string;
  quelle: PruefstandQuelle;
  externe_ref: string;
  agency_vorschlag: string | null;
  name: string | null;
  daten: Record<string, unknown>;
  gruende: string[];
  status: 'wartet' | 'offen' | 'freigegeben' | 'verworfen';
  versuche: number;
  created_at: string;
}

export async function legeAufPruefstand(
  svc: SupabaseClient,
  e: {
    quelle: PruefstandQuelle;
    externeRef: string;
    agencyVorschlag: string | null;
    name: string | null;
    daten: Record<string, unknown>;
    gruende: string[];
    status: 'wartet' | 'offen';
    /** Wann automatisch erneut prüfen */
    naechsterVersuchInMin: number;
  },
): Promise<void> {
  const { data: alt, error: lesefehler } = await svc.from('bewerber_pruefstand').select('id, status, versuche').eq('externe_ref', e.externeRef).maybeSingle();
  if (lesefehler) throw new Error(`Prüfstand nicht lesbar: ${lesefehler.message}`);
  const naechster = new Date(Date.now() + e.naechsterVersuchInMin * 60_000).toISOString();
  const a = alt as { id: string; status: string; versuche: number } | null;
  if (a && (a.status === 'freigegeben' || a.status === 'verworfen')) return;
  const zeile = {
    quelle: e.quelle,
    externe_ref: e.externeRef,
    agency_vorschlag: e.agencyVorschlag,
    name: e.name,
    daten: e.daten,
    gruende: e.gruende,
    status: e.status,
    naechster_versuch: naechster,
    updated_at: new Date().toISOString(),
  };
  const { error } = a
    ? await svc.from('bewerber_pruefstand').update({ ...zeile, versuche: a.versuche + 1 }).eq('id', a.id)
    : await svc.from('bewerber_pruefstand').insert(zeile);
  if (error) throw new Error(`Prüfstand nicht gespeichert: ${error.message}`);
}

/** Bewerber wurde (automatisch oder per Freigabe) übernommen → Eintrag schließen */
export async function schliessePruefstand(
  svc: SupabaseClient,
  externeRef: string,
  ergebnis: { agencyId: string; candidateId: string | null; von?: string | null },
): Promise<void> {
  await svc
    .from('bewerber_pruefstand')
    .update({
      status: 'freigegeben',
      ergebnis_agency_id: ergebnis.agencyId,
      ergebnis_candidate_id: ergebnis.candidateId,
      entschieden_von: ergebnis.von ?? null,
      entschieden_am: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('externe_ref', externeRef)
    .in('status', ['wartet', 'offen']);
}

/** Einträge, die jetzt automatisch erneut geprüft werden sollen */
export async function faelligeEintraege(svc: SupabaseClient, quelle: PruefstandQuelle, limit = 15): Promise<PruefstandEintrag[]> {
  const { data, error } = await svc
    .from('bewerber_pruefstand')
    .select('id, quelle, externe_ref, agency_vorschlag, name, daten, gruende, status, versuche, created_at')
    .eq('quelle', quelle)
    .in('status', ['wartet', 'offen'])
    .lte('naechster_versuch', new Date().toISOString())
    .order('naechster_versuch', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Prüfstand nicht lesbar: ${error.message}`);
  return (data ?? []) as PruefstandEintrag[];
}

/** Neue offene Fälle einmal als Sammel-Alarm melden (Glocke + Slack) */
export async function meldeNeueOffene(svc: SupabaseClient): Promise<number> {
  const { data } = await svc
    .from('bewerber_pruefstand')
    .select('id, name, quelle, gruende, agency_vorschlag, agencies:agencies!bewerber_pruefstand_agency_vorschlag_fkey(name)')
    .eq('status', 'offen')
    .is('gemeldet_am', null)
    .limit(50);
  const neu = (data ?? []) as unknown as Array<{ id: string; name: string | null; quelle: string; gruende: string[]; agencies: { name: string } | null }>;
  if (!neu.length) return 0;
  const zeilen = neu.slice(0, 6).map((n) => `${n.name ?? 'Unbekannt'} → ${n.agencies?.name ?? 'kein Kunde'} (${n.quelle}): ${n.gruende[0] ?? ''}`);
  await alarmAnAdmins(svc, {
    titel: `⛔ ${neu.length} Bewerber auf dem Prüfstand – NICHT weitergegeben (${neu.map((n) => n.id.slice(0, 4)).join(',').slice(0, 40)})`,
    text: `${zeilen.join(' | ')}${neu.length > 6 ? ` | … und ${neu.length - 6} weitere` : ''}. Bitte unter /admin/pruefstand freigeben oder verwerfen.`,
    link: '/admin/pruefstand',
  });
  await svc.from('bewerber_pruefstand').update({ gemeldet_am: new Date().toISOString() }).in('id', neu.map((n) => n.id));
  return neu.length;
}
