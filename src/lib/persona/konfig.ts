import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret } from '@/lib/crypto';

/** agencies.settings.persona – Schlüssel nur verschlüsselt, nie an den Browser */
export interface PersonaSettings {
  aktiv?: boolean;
  freigeschaltet_am?: string | null;
  api_key_enc?: string | null;
  webhook_secret_enc?: string | null;
}

export function personaAusSettings(settings: unknown): PersonaSettings {
  const p = (settings as { persona?: unknown } | null)?.persona;
  return p && typeof p === 'object' ? (p as PersonaSettings) : {};
}

export async function ladePersonaSettings(svc: SupabaseClient, agencyId: string): Promise<{ settings: Record<string, unknown>; persona: PersonaSettings }> {
  const { data } = await svc.from('agencies').select('settings').eq('id', agencyId).maybeSingle();
  const settings = ((data as { settings: Record<string, unknown> | null } | null)?.settings ?? {}) as Record<string, unknown>;
  return { settings, persona: personaAusSettings(settings) };
}

/** Öffentlicher Stand für die Oberfläche */
export async function personaKonfig(svc: SupabaseClient, agencyId: string): Promise<{ aktiv: boolean; hatSchluessel: boolean; hatWebhookSecret: boolean }> {
  const { persona } = await ladePersonaSettings(svc, agencyId);
  return { aktiv: !!persona.aktiv, hatSchluessel: !!persona.api_key_enc, hatWebhookSecret: !!persona.webhook_secret_enc };
}

/** Entschlüsselter API-Schlüssel – nur wenn freigeschaltet */
export async function personaSchluessel(svc: SupabaseClient, agencyId: string): Promise<string | null> {
  const { persona } = await ladePersonaSettings(svc, agencyId);
  if (!persona.aktiv || !persona.api_key_enc) return null;
  try {
    return decryptSecret(persona.api_key_enc);
  } catch {
    return null;
  }
}

export async function personaWebhookSecret(svc: SupabaseClient, agencyId: string): Promise<string | null> {
  const { persona } = await ladePersonaSettings(svc, agencyId);
  if (!persona.webhook_secret_enc) return null;
  try {
    return decryptSecret(persona.webhook_secret_enc);
  } catch {
    return null;
  }
}
