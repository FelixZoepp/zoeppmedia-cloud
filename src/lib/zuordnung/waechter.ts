/**
 * Zuordnungs-Wächter (alle 15 Minuten im Tick): meldet, sobald ein Bewerber-Abruf hängt, Perspective nicht
 * verbunden ist, Bewerber zu lange auf dem Prüfstand liegen oder ein Kunde keine Indeed-Belege schickt
 * (Weiterleitung fehlt → seine Manatal-Bewerber können nicht doppelt belegt werden).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { alarmAnAdmins } from '@/lib/ops/alarm';

async function lies(svc: SupabaseClient, key: string): Promise<Record<string, unknown> | null> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', key).maybeSingle();
  const w = (data as { wert: unknown } | null)?.wert;
  if (w == null) return null;
  try {
    return (typeof w === 'string' ? JSON.parse(w) : w) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface WaechterBefund {
  titel: string;
  text: string;
}

/** Rein, testbar: Befunde aus den Herzschlägen und Zahlen */
export function befunde(e: {
  jetzt: Date;
  manatalLauf: string | null;
  manatalAktiv: boolean;
  perspective: { zeit?: string; verbunden?: boolean; fehler?: string[] } | null;
  offenAelterAls2h: number;
  ohneBelege: string[];
}): WaechterBefund[] {
  const out: WaechterBefund[] = [];
  const alt = (t: string | null | undefined, min: number) => !t || e.jetzt.getTime() - Date.parse(t) > min * 60_000;
  if (e.manatalAktiv && alt(e.manatalLauf, 10)) {
    out.push({ titel: '🚨 Manatal-Abruf hängt', text: `Letzter erfolgreicher Manatal-Abruf: ${e.manatalLauf ?? 'nie'}. Indeed-Bewerber kommen gerade NICHT in die Cloud.` });
  }
  if (!e.perspective || alt(e.perspective.zeit, 20)) {
    out.push({ titel: '🚨 Perspective-Abruf hängt', text: `Letzter Perspective-Abruf: ${e.perspective?.zeit ?? 'nie'}. Meta-Bewerber kommen nur noch per Webhook.` });
  } else if (e.perspective.verbunden === false) {
    out.push({ titel: '🔌 Perspective nicht verbunden', text: 'Meta-Bewerber werden nur per Webhook übernommen – fehlt ein Webhook, gehen Bewerber verloren. Unter Admin → Anbindung „Perspective verbinden“.' });
  } else if (e.perspective.fehler?.length) {
    out.push({ titel: '⚠️ Perspective-Abruf mit Fehlern', text: e.perspective.fehler.slice(0, 5).join(' | ') });
  }
  if (e.offenAelterAls2h > 0) {
    out.push({ titel: '⏳ Bewerber warten auf dem Prüfstand', text: `${e.offenAelterAls2h} Bewerber sind NICHT beim Kunden. Bitte unter /admin/pruefstand freigeben oder verwerfen.` });
  }
  if (e.ohneBelege.length) {
    out.push({ titel: '📭 Indeed-Weiterleitung fehlt', text: `Keine Indeed-Belege in den letzten 7 Tagen von: ${e.ohneBelege.join(', ')}. Ihre Manatal-Bewerber landen deshalb auf dem Prüfstand. Im Indeed-Konto die Bewerbungs-Benachrichtigung an die Cloud-Adresse weiterleiten.` });
  }
  return out;
}

export async function pruefeZuordnungsWaechter(svc: SupabaseClient, jetzt: Date = new Date()): Promise<WaechterBefund[]> {
  const manatal = await lies(svc, 'manatal_letzter_lauf');
  const perspective = (await lies(svc, 'perspective_abruf_letzter_lauf')) as { zeit?: string; verbunden?: boolean; fehler?: string[] } | null;
  const zweiStunden = new Date(jetzt.getTime() - 2 * 3600_000).toISOString();
  const vierStunden = new Date(jetzt.getTime() - 4 * 3600_000).toISOString();
  const [{ count: offen }, { count: haengt }] = await Promise.all([
    svc.from('bewerber_pruefstand').select('id', { count: 'exact', head: true }).eq('status', 'offen').lte('created_at', zweiStunden),
    svc.from('bewerber_pruefstand').select('id', { count: 'exact', head: true }).eq('status', 'wartet').lte('created_at', vierStunden),
  ]);

  // Kunden mit Manatal-Bewerbern in den letzten 7 Tagen, aber ohne Indeed-Beleg
  const sieben = new Date(jetzt.getTime() - 7 * 864e5).toISOString();
  const { data: ps } = await svc.from('bewerber_pruefstand').select('agency_vorschlag').eq('quelle', 'manatal').gte('created_at', sieben).not('agency_vorschlag', 'is', null);
  const kunden = [...new Set(((ps ?? []) as Array<{ agency_vorschlag: string }>).map((x) => x.agency_vorschlag))];
  const ohne: string[] = [];
  for (const id of kunden) {
    const { count } = await svc.from('indeed_belege').select('id', { count: 'exact', head: true }).eq('agency_id', id).gte('empfangen_am', sieben);
    if (!count) {
      const { data: a } = await svc.from('agencies').select('name').eq('id', id).maybeSingle();
      ohne.push((a as { name: string } | null)?.name ?? id);
    }
  }

  const liste = befunde({
    jetzt,
    manatalLauf: (manatal?.zeit as string | undefined) ?? null,
    manatalAktiv: !!process.env.MANATAL_API_TOKEN,
    perspective,
    offenAelterAls2h: (offen ?? 0) + (haengt ?? 0),
    ohneBelege: ohne,
  });
  for (const b of liste) await alarmAnAdmins(svc, { titel: b.titel, text: b.text, link: '/admin/pruefstand' });
  return liste;
}
