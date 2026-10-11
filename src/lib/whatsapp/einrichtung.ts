/**
 * Kunden-WhatsApp-Nummer einrichten (Embedded Signup oder manuell durch Admin):
 * Nummer gehört zum Konto? → speichern (Status „einrichtung“) → eigene PIN → registrieren → Webhook abonnieren →
 * Anzeige-Nummer/Firmenname/Qualität laden → erst wenn alles klappt „connected“ → Vorlagen einreichen.
 * Fehler werden mit Grund gespeichert und angezeigt (kein stilles „verbunden“).
 */

import { randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getProvider } from './provider';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { seedTemplatesForAccount } from './template-presets';

export interface EinrichtungsErgebnis {
  ok: boolean;
  accountId?: string;
  status: 'connected' | 'einrichtung';
  fehler: string[];
  http?: number;
}

const kurz = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** „bereits registriert“ ist kein Fehler */
const schonRegistriert = (msg: string) => /already registered|bereits registriert|133005|133016/i.test(msg);

export async function richteNummerEin(
  svc: SupabaseClient,
  p: { agencyId: string; wabaId: string; phoneNumberId: string; accessToken: string; userId: string; methode: 'embedded_signup' | 'manual' },
): Promise<EinrichtungsErgebnis> {
  const provider = getProvider();
  const fehler: string[] = [];

  // Nummer gehört wirklich zu diesem Geschäftskonto?
  if (provider.listPhoneIds) {
    const ids = await provider.listPhoneIds(p.wabaId, p.accessToken).catch((e) => {
      fehler.push(`Nummern des Kontos nicht lesbar: ${kurz(e)}`);
      return null;
    });
    if (ids && !ids.includes(p.phoneNumberId)) {
      return { ok: false, status: 'einrichtung', fehler: ['Die gewählte Nummer gehört nicht zu diesem WhatsApp-Geschäftskonto'], http: 400 };
    }
  }

  // Nummer schon bei einem anderen Kunden?
  const { data: vorhanden } = await svc.from('whatsapp_accounts').select('id, agency_id, pin_enc').eq('phone_number_id', p.phoneNumberId).maybeSingle();
  const alt = vorhanden as { id: string; agency_id: string; pin_enc: string | null } | null;
  if (alt && alt.agency_id !== p.agencyId) return { ok: false, status: 'einrichtung', fehler: ['Diese Telefonnummer ist bereits mit einem anderen Kunden verbunden'], http: 409 };

  const pin = alt?.pin_enc ? decryptSecret(alt.pin_enc) : String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { data: acc, error } = await svc
    .from('whatsapp_accounts')
    .upsert(
      {
        agency_id: p.agencyId,
        waba_id: p.wabaId,
        phone_number_id: p.phoneNumberId,
        access_token_enc: encryptSecret(p.accessToken),
        pin_enc: encryptSecret(pin),
        provider: 'cloud_api',
        status: 'einrichtung',
        fehler: null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'phone_number_id' },
    )
    .select('id')
    .single();
  if (error || !acc) return { ok: false, status: 'einrichtung', fehler: [`Speichern fehlgeschlagen: ${error?.message ?? ''}`], http: 500 };
  const accountId = (acc as { id: string }).id;

  return pruefeUndAktiviere(svc, accountId, { userId: p.userId, methode: p.methode, vorFehler: fehler });
}

/** Registrierung, Webhook und Nummern-Infos (erneut) prüfen – auch über „Erneut prüfen“ in der Oberfläche */
export async function pruefeUndAktiviere(
  svc: SupabaseClient,
  accountId: string,
  opts: { userId?: string | null; methode?: string; vorFehler?: string[] } = {},
): Promise<EinrichtungsErgebnis> {
  const provider = getProvider();
  const fehler = [...(opts.vorFehler ?? [])];
  const { data } = await svc.from('whatsapp_accounts').select('id, agency_id, waba_id, phone_number_id, access_token_enc, pin_enc, status').eq('id', accountId).single();
  const a = data as { id: string; agency_id: string; waba_id: string; phone_number_id: string; access_token_enc: string; pin_enc: string | null; status: string };
  const token = decryptSecret(a.access_token_enc);
  const pin = a.pin_enc ? decryptSecret(a.pin_enc) : undefined;

  let registriert = true;
  await provider.registerPhone(a.phone_number_id, token, pin).catch((e) => {
    const m = kurz(e);
    if (!schonRegistriert(m)) {
      registriert = false;
      fehler.push(`Registrierung der Nummer: ${m}`);
    }
  });
  let abonniert = true;
  await provider.subscribeWebhook(a.waba_id, token).catch((e) => {
    abonniert = false;
    fehler.push(`Webhook-Abo: ${kurz(e)}`);
  });
  const info = provider.getPhoneInfo ? await provider.getPhoneInfo(a.phone_number_id, token).catch((e) => (fehler.push(`Nummern-Infos: ${kurz(e)}`), null)) : null;

  const ok = registriert && abonniert;
  const status: 'connected' | 'einrichtung' = ok ? 'connected' : 'einrichtung';
  await svc
    .from('whatsapp_accounts')
    .update({
      status,
      fehler: fehler.length ? fehler.join(' · ') : null,
      geprueft_am: new Date().toISOString(),
      ...(info ? { display_number: info.displayNumber, verified_name: info.verifiedName, quality_rating: info.qualityRating, messaging_limit: info.messagingLimit } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', a.id);

  if (ok && a.status !== 'connected') {
    await seedTemplatesForAccount(svc, a.id, a.agency_id);
    const { signalSafe } = await import('@/lib/fulfillment/engine');
    await signalSafe(svc, a.agency_id, 'whatsapp_verbunden');
    if (opts.userId) {
      await svc.from('audit_log').insert({ actor_id: opts.userId, agency_id: a.agency_id, action: 'whatsapp.connected', target: a.id, data: { waba_id: a.waba_id, phone_number_id: a.phone_number_id, method: opts.methode ?? 'pruefen' } });
    }
  }
  return { ok, accountId: a.id, status, fehler };
}

/** Qualität/Limit aller verbundenen Kunden-Nummern auffrischen (stündliche Pflege) – sinkt die Qualität, Alarm */
export async function frischeNummernAuf(svc: SupabaseClient): Promise<number> {
  const provider = getProvider();
  if (!provider.getPhoneInfo) return 0;
  const { data } = await svc.from('whatsapp_accounts').select('id, agency_id, phone_number_id, access_token_enc, quality_rating, display_number').eq('status', 'connected');
  let n = 0;
  for (const a of (data ?? []) as Array<{ id: string; agency_id: string; phone_number_id: string; access_token_enc: string; quality_rating: string | null; display_number: string | null }>) {
    try {
      const info = await provider.getPhoneInfo(a.phone_number_id, decryptSecret(a.access_token_enc));
      await svc
        .from('whatsapp_accounts')
        .update({ display_number: info.displayNumber, verified_name: info.verifiedName, quality_rating: info.qualityRating, messaging_limit: info.messagingLimit, geprueft_am: new Date().toISOString() })
        .eq('id', a.id);
      if (info.qualityRating && info.qualityRating !== a.quality_rating && /RED|YELLOW/i.test(info.qualityRating)) {
        const { alarmAnAdmins } = await import('@/lib/ops/alarm');
        await alarmAnAdmins(svc, {
          titel: `⚠️ WhatsApp-Qualität ${info.qualityRating === 'RED' ? 'rot' : 'gelb'}: ${info.displayNumber ?? a.display_number ?? a.phone_number_id}`,
          text: 'Meta hat die Qualität der Kundennummer herabgestuft. Bot-Nachrichten prüfen (zu häufig? zu werblich?), sonst droht eine Sperre.',
          agencyId: a.agency_id,
        });
      }
      n++;
    } catch {
      // nächste Stunde erneut
    }
  }
  return n;
}
