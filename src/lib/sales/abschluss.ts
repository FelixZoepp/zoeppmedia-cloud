/**
 * Nach „Abgeschlossen“ im Protokoll nachziehen (nur mit Freigabe „abschluss_nachziehen“, nichts geht an den Kunden):
 * - Gesprächsanalysen des Leads sofort auf „gewonnen“ (sonst erst beim täglichen Abgleich) und die Close-Notiz
 *   zeigt „✅ Abgeschlossen“ statt „Abschlusschance … %“
 * - Close-Aufgabe „Auftragswert prüfen“, wenn ein Wert eingetragen ist (fehlt er, legt protokolle.ts schon eine an)
 * - interne Aufgabe „Kunde in der Cloud anlegen“, falls es noch keinen Kunden mit dem Namen gibt –
 *   bewusst nicht über After-Close, weil dort die Vertrags-Mail rausgeht
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const CLOSE_BASE = 'https://api.close.com/api/v1';

function headers(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}
async function close<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLOSE_BASE}${path}`, { ...init, headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status} bei ${path.split('?')[0]}`);
  return (await res.json()) as T;
}

/** „7.200 € einmalig“ / „1.000 € monatlich“ (rein, testbar) – Close speichert Cent */
export function wertText(value: number | null | undefined, period: string | null | undefined): string | null {
  if (!value) return null;
  const eur = (value / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  const art = period === 'monthly' ? 'monatlich' : period === 'annual' ? 'jährlich' : 'einmalig';
  return `${eur} € ${art}`;
}

/** Namen grob vergleichen (Groß/Klein, Rechtsform, Sonderzeichen egal) – rein, testbar */
export function gleicherName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\b(gmbh|ug|haftungsbeschrankt|ag|kg|ohg|gbr|e\.?k\.?|co)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

export async function zieheAbschlussNach(svc: SupabaseClient, leadId: string, userId: string | null): Promise<Record<string, unknown>> {
  const erg: Record<string, unknown> = {};
  const heute = new Date().toISOString().slice(0, 10);

  // 1) Gesprächsanalysen auf gewonnen + Close-Notiz ohne „Abschlusschance“
  const { data: analysen } = await svc
    .from('gespraech_analysen')
    .select('fireflies_id, titel, datum, dauer_min, close_note_id, ergebnis, ausgang')
    .eq('close_lead_id', leadId);
  const { closeNotiz } = await import('@/lib/gespraeche/analyse');
  const { updateCloseNote } = await import('./close');
  let analysenNeu = 0;
  for (const r of (analysen ?? []) as Array<{ fireflies_id: string; titel: string | null; datum: string | null; dauer_min: number | null; close_note_id: string | null; ergebnis: Parameters<typeof closeNotiz>[1] | null; ausgang: string | null }>) {
    if (r.ausgang === 'gewonnen') continue;
    await svc.from('gespraech_analysen').update({ ausgang: 'gewonnen', ausgang_am: heute }).eq('fireflies_id', r.fireflies_id);
    if (r.close_note_id && r.ergebnis) {
      await updateCloseNote(r.close_note_id, closeNotiz({ id: r.fireflies_id, titel: r.titel, datum: r.datum, dauerMin: r.dauer_min }, r.ergebnis, 'gewonnen')).catch(() => {});
    }
    analysenNeu++;
  }
  erg.analysen = analysenNeu;

  // 2) Auftragswert prüfen (einmalig vs. monatlich)
  const [lead, { data: opps }] = await Promise.all([
    close<{ display_name: string }>(`/lead/${leadId}/?_fields=display_name`),
    close<{ data: Array<{ id: string; value: number | null; value_period: string | null }> }>(`/opportunity/?lead_id=${leadId}&status_type=won&_fields=id,value,value_period`),
  ]);
  const wert = opps.map((o) => wertText(o.value, o.value_period)).filter(Boolean).join(' + ');
  if (wert) {
    const { data: offen } = await close<{ data: Array<{ text: string }> }>(`/task/?lead_id=${leadId}&is_complete=false&_fields=text`);
    if (!offen.some((t) => t.text.startsWith('💰 Auftragswert prüfen'))) {
      await close('/task/', {
        method: 'POST',
        body: JSON.stringify({
          lead_id: leadId,
          ...(userId ? { assigned_to: userId } : {}),
          text: `💰 Auftragswert prüfen: in Close steht ${wert}. Einrichtung einmalig und Monatsgebühr als eigene Werte eintragen, damit Umsatz und Controlling stimmen.`,
          date: heute,
        }),
      });
      erg.wertAufgabe = wert;
    }
  }

  // 3) Kunde in der Cloud anlegen (ohne Vertrags-Mail)
  const name = lead.display_name ?? 'Neuer Kunde';
  const { data: kunden } = await svc.from('agencies').select('id, name');
  const vorhanden = ((kunden ?? []) as Array<{ id: string; name: string }>).find((k) => gleicherName(k.name, name));
  if (vorhanden) erg.kunde = vorhanden.id;
  else {
    const titel = `🆕 Kunde in der Cloud anlegen – ${name}`;
    const { count } = await svc.from('internal_tasks').select('id', { count: 'exact', head: true }).eq('title', titel);
    if (!count) {
      await svc.from('internal_tasks').insert({
        title: titel,
        description: `${name} hat abgeschlossen (Protokoll „Abgeschlossen“).\n\nKunden in der Cloud anlegen – NICHT über After-Close, wenn der Vertrag schon unterschrieben ist (dort geht die Vertrags-Mail raus).\nClose: https://app.close.com/lead/${leadId}/`,
        status: 'todo',
        priority: 'high',
        due_date: heute,
        created_by: null,
      });
      erg.kundeAufgabe = true;
    }
  }
  return erg;
}
