import type { SupabaseClient } from '@supabase/supabase-js';
import { sendeWochenberichtEmail } from '@/lib/email/resend';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { ladeBerichtKunden, ladeWochenbericht } from './laden';
import { betreffWochenbericht, wochenberichtHtml } from './email';
import { fuerKunde } from './berechnung';

/** Schalter „Wochenberichte automatisch montags senden“ (system_einstellungen) */
export const AKTIV_KEY = 'wochenberichte_aktiv';

export async function automatikAktiv(svc: SupabaseClient): Promise<boolean> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', AKTIV_KEY).maybeSingle();
  return (data as { wert: string } | null)?.wert === 'true';
}

export async function setzeAutomatik(svc: SupabaseClient, aktiv: boolean): Promise<void> {
  const { error } = await svc.from('system_einstellungen').upsert({ key: AKTIV_KEY, wert: aktiv ? 'true' : 'false' }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

export interface VersandErgebnis {
  agency_id: string;
  name: string;
  status: string | null;
  ergebnis: 'gesendet' | 'schon_gesendet' | 'kein_empfaenger' | 'pausiert' | 'fehler';
  fehler?: string;
}

/**
 * Berichte der Woche erstellen und senden.
 * Ein Bericht pro Kunde und KW – schon gesendete werden nicht doppelt verschickt (außer `erneut`).
 */
export async function sendeWochenberichte(
  svc: SupabaseClient,
  opts: { jetzt?: Date; nurId?: string; erneut?: boolean; cloudUrl?: string } = {},
): Promise<VersandErgebnis[]> {
  const jetzt = opts.jetzt ?? new Date();
  const cloudUrl = opts.cloudUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://cloud.zoeppmedia.de';
  const kunden = await ladeBerichtKunden(svc, opts.nurId);
  const out: VersandErgebnis[] = [];

  for (const k of kunden) {
    const basis = { agency_id: k.id, name: k.name };
    if (k.pausiert && !opts.nurId) {
      out.push({ ...basis, status: null, ergebnis: 'pausiert' });
      continue;
    }
    try {
      const bericht = await ladeWochenbericht(svc, k.id, jetzt);
      if (!bericht) continue;
      const { data: vorhanden } = await svc
        .from('wochenberichte')
        .select('id, gesendet_am')
        .eq('agency_id', k.id)
        .eq('jahr', bericht.jahr)
        .eq('kw', bericht.kw)
        .maybeSingle();
      if ((vorhanden as { gesendet_am: string | null } | null)?.gesendet_am && !opts.erneut) {
        out.push({ ...basis, status: bericht.status, ergebnis: 'schon_gesendet' });
        continue;
      }
      const empfaenger = k.empfaenger.map((e) => e.email);
      await svc
        .from('wochenberichte')
        .upsert({ agency_id: k.id, jahr: bericht.jahr, kw: bericht.kw, status: bericht.status, daten: bericht, empfaenger, fehler: null }, { onConflict: 'agency_id,jahr,kw' });
      if (!empfaenger.length) {
        out.push({ ...basis, status: bericht.status, ergebnis: 'kein_empfaenger' });
        continue;
      }
      const ueberblick = fuerKunde(bericht);
      await sendeWochenberichtEmail(empfaenger, betreffWochenbericht(ueberblick), wochenberichtHtml(ueberblick, `${cloudUrl}/dashboard`));
      await svc.from('wochenberichte').update({ gesendet_am: new Date().toISOString() }).eq('agency_id', k.id).eq('jahr', bericht.jahr).eq('kw', bericht.kw);
      out.push({ ...basis, status: bericht.status, ergebnis: 'gesendet' });
      await new Promise((r) => setTimeout(r, 400)); // Resend-Limit
    } catch (err) {
      const fehler = err instanceof Error ? err.message : 'Fehler';
      console.error('[wochenbericht]', k.name, fehler);
      out.push({ ...basis, status: null, ergebnis: 'fehler', fehler });
    }
  }

  // Team informieren (intern): bei wem läuft es nicht rund?
  const kritisch = out.filter((x) => x.status === 'kritisch').map((x) => x.name);
  const achtung = out.filter((x) => x.status === 'achtung').map((x) => x.name);
  if (!opts.nurId && (kritisch.length || achtung.length)) {
    await createNotificationForInternals(svc, {
      title: `Wochenberichte: ${kritisch.length} kritisch, ${achtung.length} mit Achtung`,
      body: [kritisch.length ? `Kritisch: ${kritisch.join(', ')}` : '', achtung.length ? `Achtung: ${achtung.join(', ')}` : ''].filter(Boolean).join(' · ').slice(0, 300),
      type: 'system',
      push_url: '/admin/wochenberichte',
    }).catch(() => {});
  }
  return out;
}
