/**
 * Einmalige Einrichtung in Close (über den API-Key der Cloud): Felder des Protokolls
 * „2 - Gesprächsprotokoll (Setting)“ nach dem Setting-Skript Recruiting Direktvertrieb.
 * Idempotent: vorhandene Felder werden umbenannt/angepasst, fehlende angelegt (Abgleich über den Namen),
 * nichts wird gelöscht. Ausgelöst als Job 'close.einrichtung' (payload { was: 'setting_protokoll' }).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { PROTOKOLL_TYPEN } from '@/lib/sales-controlling/tagesbericht';

const CLOSE_BASE = 'https://api.close.com/api/v1';

function headers(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}

async function close<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLOSE_BASE}${path}`, { ...init, headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${init?.method ?? 'GET'} ${path.split('?')[0]}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

type FeldTyp = 'text' | 'number' | 'date' | 'datetime' | 'choices' | 'user';

export interface FeldSoll {
  key: string;
  name: string;
  typ: FeldTyp;
  choices?: string[];
  /** vorhandenes Feld, das umbenannt/angepasst wird */
  id?: string;
}

const JA_NEIN = ['Ja', 'Nein'];

/** Felder in Skript-Reihenfolge */
export const SETTING_FELDER: FeldSoll[] = [
  { key: 'produktRegion', name: 'Produkt & Region', typ: 'text' },
  { key: 'problem', name: 'Größtes Problem bei der Vertriebler-Gewinnung', typ: 'text' },
  { key: 'bisherAusprobiert', name: 'Bisher ausprobiert & warum nicht geklappt', typ: 'text' },
  { key: 'gs1Bedarf', name: 'GS 1 · Bedarf bestätigt', typ: 'choices', choices: JA_NEIN },
  { key: 'vertrieblerAktuell', name: 'Vertriebler aktuell', typ: 'number' },
  { key: 'anstellungsart', name: 'Anstellungsart', typ: 'choices', choices: ['Angestellt', 'Handelsvertreter Vollzeit', 'Handelsvertreter nebenbei', 'Gemischt'] },
  { key: 'umsatzMonat', name: 'Umsatz pro Monat (€)', typ: 'number' },
  { key: 'zielProMonat', name: 'Ziel: neue Vertriebler pro Monat', typ: 'number' },
  { key: 'zielWarum', name: 'Warum ist das Ziel wichtig?', typ: 'text' },
  { key: 'bewerberAnrufen', name: 'Bewerber anrufen', typ: 'choices', choices: ['Selbst', 'Teamleiter', 'Abgeben (Innendienst)'] },
  { key: 'gs2Budget', name: 'GS 2 · Monatsbudget inkl. Werbebudget (€)', typ: 'number' },
  { key: 'gs2Liquide', name: 'GS 2 · Geld liquide', typ: 'choices', choices: JA_NEIN },
  {
    key: 'gs3Entscheider',
    name: 'GS 3 · Entscheider',
    typ: 'choices',
    choices: ['Allein', 'Weitere kommen mit', 'Weitere entscheiden mit, kommen nicht'],
    id: 'cf_4JnvFLfCswsX7EK0bbgWtdeN9iQ5e931psSTJhpLksg',
  },
  { key: 'weitereTeilnehmer', name: 'Weitere Teilnehmer im Termin', typ: 'text' },
  { key: 'gs4Start', name: 'GS 4 · Möglicher Start', typ: 'date' },
  { key: 'gs5Geeignet', name: 'GS 5 · Persönlich geeignet (respektvoll)', typ: 'choices', choices: JA_NEIN },
  { key: 'garantieGefragt', name: 'Hat nach Garantie gefragt', typ: 'choices', choices: JA_NEIN },
  { key: 'whatsappNummer', name: 'WhatsApp-Nummer (nur wenn abweichend)', typ: 'text' },
  {
    key: 'ergebnis',
    name: '✅ Ergebnis',
    typ: 'choices',
    choices: ['Beratungsgespräch gelegt', 'Follow-up / Rückruf', 'Unqualifiziert', 'Disqualifiziert', 'No-Show', 'Verschoben', 'Abgesagt'],
    id: 'cf_xPhL5XUDQ8i4gCcUF4pz5uMaHUoIMwZXB3af8Xv0A6B',
  },
  {
    key: 'grund',
    name: 'Grund (bei Unqualifiziert)',
    typ: 'choices',
    choices: ['Kein Bedarf (GS 1)', 'Kein Budget / nicht liquide (GS 2)', 'Entscheider fehlt (GS 3)', 'Kein zeitnaher Start (GS 4)', 'Respektlos (GS 5)', 'Passt nicht (Branche/Modell)'],
  },
  { key: 'kalender', name: '📅 Kalender (Beratungsgespräch / Rückruf)', typ: 'datetime', id: 'cf_U7wmwfAu5xqLmfNXv2nYx5EbiLHGFdsZC4nJKHBeR3G' },
  { key: 'closer', name: 'Closer', typ: 'user', id: 'cf_v6iiRmUU1aRBhZwaQebR1kpsjJQykQAzxdLjoo2m6zt' },
  // Rich Text bleibt das vorhandene Feld (wird nur umbenannt)
  { key: 'notizen', name: 'Notizen für den Closer', typ: 'text', id: 'cf_HyQjx7kUMpcUxcsFqGKgtiPy9EUyHjvTfjlMNyou5dU' },
];

interface CloseFeld {
  id: string;
  name: string;
  type: string;
  custom_activity_type_id?: string;
}

/** Felder eines Protokoll-Typs einrichten. Gibt key → Feld-ID zurück. */
export async function richteProtokollFelderEin(typId: string, soll: FeldSoll[]): Promise<{ ids: Record<string, string>; angelegt: string[]; angepasst: string[] }> {
  const alle = await close<{ data: CloseFeld[] }>(`/custom_field/activity/?_limit=500`);
  const vorhanden = alle.data.filter((f) => f.custom_activity_type_id === typId);
  const ids: Record<string, string> = {};
  const angelegt: string[] = [];
  const angepasst: string[] = [];

  for (const f of soll) {
    const treffer = f.id ? vorhanden.find((v) => v.id === f.id) : vorhanden.find((v) => v.name.trim() === f.name);
    if (treffer) {
      // Name + Auswahl angleichen (Typ bleibt – Rich Text u. ä. werden nur umbenannt)
      const body: Record<string, unknown> = { name: f.name };
      if (f.choices && treffer.type === 'choices') body.choices = f.choices;
      await close(`/custom_field/activity/${treffer.id}/`, { method: 'PUT', body: JSON.stringify(body) });
      ids[f.key] = treffer.id;
      angepasst.push(f.name);
      continue;
    }
    const neu = await close<{ id: string }>(`/custom_field/activity/`, {
      method: 'POST',
      body: JSON.stringify({
        name: f.name,
        type: f.typ,
        custom_activity_type_id: typId,
        ...(f.choices ? { choices: f.choices, accepts_multiple_values: false } : {}),
      }),
    });
    ids[f.key] = neu.id;
    angelegt.push(f.name);
  }
  return { ids, angelegt, angepasst };
}

/** Job close.einrichtung */
export async function fuehreCloseEinrichtungAus(svc: SupabaseClient, was: string): Promise<void> {
  if (was !== 'setting_protokoll') throw new Error(`Unbekannte Einrichtung: ${was}`);
  const ergebnis = await richteProtokollFelderEin(PROTOKOLL_TYPEN.setting, SETTING_FELDER);
  await svc.from('system_einstellungen').upsert(
    { key: 'close_setting_protokoll_felder', wert: JSON.stringify(ergebnis), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
}
