/**
 * Pflege der WhatsApp-Vorlagen aller verbundenen Konten (Kunden + Sales):
 * - Status-Webhook von Meta (message_template_status_update) sofort übernehmen
 * - Stündlich: Status + Ablehnungsgrund abgleichen, fehlgeschlagene Einreichungen (ohne Meta-ID) erneut einreichen (max. 1×/Tag)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getProvider } from './provider';
import { decryptSecret } from '@/lib/crypto';
import { seedTemplatesForAccount, TEMPLATE_PRESETS } from './template-presets';

const ERLAUBT = new Set(['pending', 'approved', 'rejected', 'paused', 'deleted']);

export function statusAusMeta(metaStatus: string): string {
  const s = (metaStatus || '').toLowerCase();
  if (ERLAUBT.has(s)) return s;
  if (s === 'pending_deletion' || s === 'disabled') return 'deleted';
  if (s === 'flagged') return 'paused';
  return 'pending';
}

/** Event whatsapp.template_status aus dem Webhook */
export async function verarbeiteVorlagenStatus(svc: SupabaseClient, payload: { message_template_id?: string | number; event?: string; reason?: string | null }): Promise<void> {
  if (!payload.message_template_id || !payload.event) return;
  const status = statusAusMeta(payload.event);
  const grund = payload.reason && payload.reason !== 'NONE' ? String(payload.reason) : null;
  const { error } = await svc
    .from('whatsapp_templates')
    .update({ status, meta_fehler: status === 'rejected' ? grund ?? 'abgelehnt' : null, updated_at: new Date().toISOString() })
    .eq('meta_template_id', String(payload.message_template_id));
  if (error) throw new Error(`Vorlagenstatus nicht gespeichert: ${error.message}`);
}

/** Tick: einmal pro Stunde planen */
export async function planeVorlagenPflege(svc: SupabaseClient, agencyId: string, jetzt: Date = new Date()): Promise<void> {
  const stunde = jetzt.toISOString().slice(0, 13);
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: agencyId,
    type: 'whatsapp.vorlagen_pflege',
    run_at: jetzt.toISOString(),
    payload: { stunde },
    status: 'pending',
    dedupe_key: `whatsapp.vorlagen_pflege:${stunde}`,
  });
  if (error && error.code !== '23505') console.error('[vorlagen-pflege] nicht geplant:', error.message);
}

/** Job whatsapp.vorlagen_pflege */
export async function pflegeVorlagen(svc: SupabaseClient, jetzt: Date = new Date()): Promise<{ konten: number; aktualisiert: number; neu_eingereicht: number; fehler: string[] }> {
  const { data: konten } = await svc.from('whatsapp_accounts').select('id, agency_id, waba_id, access_token_enc').eq('status', 'connected');
  const provider = getProvider();
  let aktualisiert = 0;
  let neu = 0;
  const fehler: string[] = [];
  for (const k of (konten ?? []) as Array<{ id: string; agency_id: string; waba_id: string; access_token_enc: string }>) {
    try {
      const token = decryptSecret(k.access_token_enc);
      const liste = await provider.listTemplates(k.waba_id, token);
      for (const t of liste) {
        const status = statusAusMeta(t.status);
        const { count } = await svc
          .from('whatsapp_templates')
          .update(
            { status, meta_template_id: t.id, meta_fehler: status === 'rejected' ? t.rejectedReason ?? 'abgelehnt' : null, updated_at: jetzt.toISOString() },
            { count: 'exact' },
          )
          .eq('wa_account_id', k.id)
          .eq('name', t.name)
          .eq('language', t.language);
        if (count) aktualisiert += count;
      }
      // Kunden-Konten: Presets ohne Meta-ID (Einreichung fehlgeschlagen oder nie erfolgt) erneut einreichen – höchstens 1×/Tag
      const { data: rows } = await svc.from('whatsapp_templates').select('preset_key, meta_template_id, eingereicht_am, meta_fehler, created_at').eq('wa_account_id', k.id);
      const vorhanden = new Map(
        ((rows ?? []) as Array<{ preset_key: string | null; meta_template_id: string | null; eingereicht_am: string | null; meta_fehler: string | null; created_at: string }>).map((r) => [r.preset_key, r]),
      );
      const aufMeta = new Set(liste.map((t) => t.name));
      const faellig = TEMPLATE_PRESETS.filter((p) => {
        if (aufMeta.has(p.name)) return false;
        const r = vorhanden.get(p.presetKey);
        if (!r) return true;
        if (r.meta_template_id) return false;
        // Harte Grenzen, damit das Konto nie durch Dauer-Einreichungen auffällt:
        // „existiert schon“ → nie neu einreichen; nach 7 Tagen keine automatischen Versuche mehr
        if (r.meta_fehler && /exist/i.test(r.meta_fehler)) return false;
        if (jetzt.getTime() - new Date(r.created_at).getTime() > 7 * 24 * 3600_000) return false;
        return !r.eingereicht_am || jetzt.getTime() - new Date(r.eingereicht_am).getTime() > 24 * 3600_000;
      }).map((p) => p.presetKey);
      // Sales-Konto hat eigene Vorlagen (sales/vorlagen.ts) – dort keine Recruiting-Presets nachreichen
      const istKunde = vorhanden.size === 0 || [...vorhanden.keys()].some((key) => TEMPLATE_PRESETS.some((p) => p.presetKey === key));
      if (faellig.length && istKunde) {
        await seedTemplatesForAccount(svc, k.id, k.agency_id, faellig);
        neu += faellig.length;
      }
    } catch (err) {
      fehler.push(`${k.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const { frischeNummernAuf } = await import('./einrichtung');
  await frischeNummernAuf(svc).catch((e) => fehler.push(`Nummern-Infos: ${e instanceof Error ? e.message : String(e)}`));
  return { konten: (konten ?? []).length, aktualisiert, neu_eingereicht: neu, fehler };
}
