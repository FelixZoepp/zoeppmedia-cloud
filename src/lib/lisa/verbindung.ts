/**
 * Hiring Lisa je Kunde: Verbindung laden (Secrets entschlüsselt) und prüfen, ob Lisa für neue Bewerbungen zuständig ist.
 * Läuft mit Service-Role → jede Abfrage filtert auf agency_id.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret } from '@/lib/crypto';
import { LISA_STANDARD_URL } from './protokoll';

export type LisaStatus = 'angefragt' | 'eingerichtet' | 'aktiv' | 'pausiert';

export interface LisaVerbindungRow {
  agency_id: string;
  status: LisaStatus;
  basis_url: string | null;
  api_key_enc: string | null;
  webhook_secret_enc: string | null;
  einwilligung_text: string | null;
  einwilligung_version: string | null;
  angefragt_am: string | null;
  anfrage_notiz: string | null;
  aktiviert_am: string | null;
  letzter_versand_am: string | null;
  letztes_ereignis_am: string | null;
  letzter_fehler: string | null;
}

export interface LisaZugang {
  agencyId: string;
  basisUrl: string;
  apiKey: string;
  einwilligungText: string;
  einwilligungVersion: string | null;
}

export async function ladeLisaVerbindung(svc: SupabaseClient, agencyId: string): Promise<LisaVerbindungRow | null> {
  const { data } = await svc.from('lisa_verbindungen').select('*').eq('agency_id', agencyId).maybeSingle();
  return (data as LisaVerbindungRow | null) ?? null;
}

export function basisUrl(row: Pick<LisaVerbindungRow, 'basis_url'>): string {
  return (row.basis_url?.trim() || process.env.LISA_BASE_URL || LISA_STANDARD_URL).replace(/\/+$/, '');
}

/** Was fehlt, damit Lisa aktiv geschaltet werden darf? (leer = alles da) */
export function fehltZumAktivieren(row: Pick<LisaVerbindungRow, 'api_key_enc' | 'webhook_secret_enc' | 'einwilligung_text'>): string[] {
  const fehlt: string[] = [];
  if (!row.api_key_enc) fehlt.push('API-Schlüssel (lisa_in_…)');
  if (!row.webhook_secret_enc) fehlt.push('Webhook-Secret (lisa_whsec_…)');
  if (!row.einwilligung_text?.trim()) fehlt.push('Einwilligungstext für den KI-Anruf');
  return fehlt;
}

/**
 * Zugang nur, wenn Lisa für diesen Kunden AKTIV ist und alles hinterlegt ist.
 * Ohne Einwilligungstext ruft Lisa nie an – dann bleibt der Kunde beim eigenen Erstkontakt der Cloud.
 */
export async function aktiverLisaZugang(svc: SupabaseClient, agencyId: string): Promise<LisaZugang | null> {
  const row = await ladeLisaVerbindung(svc, agencyId);
  if (!row || row.status !== 'aktiv' || fehltZumAktivieren(row).length) return null;
  try {
    return {
      agencyId,
      basisUrl: basisUrl(row),
      apiKey: decryptSecret(row.api_key_enc!),
      einwilligungText: row.einwilligung_text!.trim(),
      einwilligungVersion: row.einwilligung_version,
    };
  } catch (err) {
    console.error('[lisa] Schlüssel nicht lesbar', agencyId, err);
    return null;
  }
}

/** Webhook-Secret für die Signaturprüfung (auch bei „pausiert“: Rückmeldungen laufender Bewerber kommen weiter an) */
export async function lisaWebhookSecret(svc: SupabaseClient, agencyId: string): Promise<string | null> {
  const row = await ladeLisaVerbindung(svc, agencyId);
  if (!row?.webhook_secret_enc || row.status === 'angefragt') return null;
  try {
    return decryptSecret(row.webhook_secret_enc);
  } catch {
    return null;
  }
}
