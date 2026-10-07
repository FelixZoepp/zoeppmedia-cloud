/**
 * Test-Lead (Fulfillment-Schritt „Test-Lead durchgespielt“):
 * schickt einen echten Lead durch den Funnel-Webhook des Kunden, prüft Cloud und WhatsApp
 * und räumt den Test-Bewerber danach wieder weg. Alles grün → Schritt hakt sich selbst ab.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { setStepStatus } from './engine';
import { bausteineVon } from './pakete';

export type PruefStatus = 'ok' | 'warnung' | 'fehler';

export interface Pruefpunkt {
  key: string;
  label: string;
  status: PruefStatus;
  hinweis: string;
}

export interface TestleadErgebnis {
  bestanden: boolean;
  punkte: Pruefpunkt[];
  schrittAbgehakt: boolean;
}

/** Externe Kennung der Test-Leads – damit Live-Anzeige und Auswertungen sie ignorieren */
export const TESTLEAD_PREFIX = 'perspective:testlead-';

/** Bestanden = kein Fehler (Warnungen sind Hinweise, z. B. noch keine automatische Begrüßung) */
export function auswerten(punkte: Pruefpunkt[]): boolean {
  return punkte.length > 0 && !punkte.some((p) => p.status === 'fehler');
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function spieleTestleadDurch(
  svc: SupabaseClient,
  agencyId: string,
  opts: { origin: string; tester: { name: string; phone: string | null }; userId: string },
): Promise<TestleadErgebnis> {
  const punkte: Pruefpunkt[] = [];
  const add = (key: string, label: string, status: PruefStatus, hinweis: string) => punkte.push({ key, label, status, hinweis });

  const { data: ag } = await svc.from('agencies').select('bausteine').eq('id', agencyId).maybeSingle();
  const bausteine = bausteineVon((ag as { bausteine?: unknown } | null)?.bausteine);

  // 1. Pipeline
  const { data: stufen } = await svc.from('pipeline_stages').select('id').or(`agency_id.eq.${agencyId},agency_id.is.null`).limit(1);
  if ((stufen ?? []).length) add('pipeline', 'Bewerber-Pipeline', 'ok', 'Stufen sind eingerichtet.');
  else add('pipeline', 'Bewerber-Pipeline', 'fehler', 'Keine Pipeline-Stufen – Bewerber können nicht angelegt werden.');

  // 2. Funnel-Webhook → Bewerber in der Cloud (echter HTTP-Aufruf wie von Perspective)
  const testId = `testlead-${Date.now()}`;
  let candidateId: string | null = null;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.PERSPECTIVE_WEBHOOK_SECRET) headers['x-webhook-secret'] = process.env.PERSPECTIVE_WEBHOOK_SECRET;
    const res = await fetch(`${opts.origin}/api/webhooks/perspective?agency=${agencyId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: testId,
        funnelName: 'Test-Lead (Zoepp Media)',
        profile: {
          name: { value: `Test-Lead – ${opts.tester.name}` },
          email: { value: `${testId}@zoepp-gruppe.de` },
          ...(opts.tester.phone ? { phone: { value: opts.tester.phone } } : {}),
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { candidate_id?: string; error?: string; duplicate?: boolean };
    if (!res.ok) {
      add('webhook', 'Bewerber-Eingang (Webhook)', 'fehler', `Webhook antwortet mit ${res.status}: ${body.error ?? 'unbekannter Fehler'}`);
    } else if (body.duplicate) {
      // Tester-Kontakt existiert schon als Bewerber – Webhook funktioniert trotzdem
      add('webhook', 'Bewerber-Eingang (Webhook)', 'ok', 'Webhook erreichbar (Kontakt war schon als Bewerber vorhanden, kein neuer angelegt).');
    } else {
      candidateId = body.candidate_id ?? null;
      add('webhook', 'Bewerber-Eingang (Webhook)', 'ok', 'Lead wurde vom Webhook angenommen.');
    }
  } catch (err) {
    add('webhook', 'Bewerber-Eingang (Webhook)', 'fehler', `Webhook nicht erreichbar: ${err instanceof Error ? err.message : 'Fehler'}`);
  }

  if (candidateId) {
    const { data: c } = await svc.from('candidates').select('id, current_stage_id').eq('id', candidateId).maybeSingle();
    if (c && (c as { current_stage_id: string | null }).current_stage_id) add('cloud', 'Bewerber in der Cloud', 'ok', 'Test-Bewerber steht in der ersten Pipeline-Stufe.');
    else add('cloud', 'Bewerber in der Cloud', 'fehler', 'Test-Bewerber wurde nicht korrekt angelegt.');
  }

  // 3. WhatsApp: Konto verbunden + (falls eingerichtet) automatische Begrüßung
  const { data: wa } = await svc.from('whatsapp_accounts').select('id').eq('agency_id', agencyId).eq('status', 'connected').limit(1).maybeSingle();
  if (!wa) {
    add('whatsapp', 'WhatsApp', 'warnung', 'Keine WhatsApp-Nummer verbunden – Bewerber bekommen keine automatische Nachricht.');
  } else if (candidateId) {
    await warte(6000); // Automationen laufen asynchron
    const { data: conv } = await svc.from('conversations').select('id').eq('candidate_id', candidateId).limit(1).maybeSingle();
    let gesendet = false;
    if (conv) {
      const { data: m } = await svc.from('messages').select('id, status').eq('conversation_id', (conv as { id: string }).id).eq('direction', 'outbound').limit(1).maybeSingle();
      gesendet = !!m;
    }
    if (gesendet) add('whatsapp', 'WhatsApp', 'ok', `Begrüßung wurde verschickt${opts.tester.phone ? ` – prüf dein Handy (${opts.tester.phone})` : ''}.`);
    else add('whatsapp', 'WhatsApp', 'warnung', 'Nummer verbunden, aber keine automatische Begrüßung eingerichtet oder sie kam nicht raus.');
  } else {
    add('whatsapp', 'WhatsApp', 'ok', 'Nummer ist verbunden.');
  }

  // 4. Indeed: Weiterleitung schon einmal genutzt?
  if (bausteine.includes('indeed')) {
    const { data: indeed } = await svc.from('candidates').select('id').eq('agency_id', agencyId).eq('source', 'indeed').limit(1).maybeSingle();
    if (indeed) add('indeed', 'Indeed-Weiterleitung', 'ok', 'Indeed-Bewerbungen kommen in der Cloud an.');
    else add('indeed', 'Indeed-Weiterleitung', 'warnung', `Noch keine Indeed-Bewerbung eingegangen – Weiterleitung an bewerber+${agencyId}@zoepp-gruppe.de prüfen.`);
  }

  // Aufräumen: Test-Bewerber aus der Kunden-Cloud nehmen und Kontaktdaten leeren,
  // damit der nächste Test nicht als Dublette erkannt wird
  if (candidateId) await svc.from('candidates').update({ deleted_at: new Date().toISOString(), email: null, phone: null }).eq('id', candidateId);

  const bestanden = auswerten(punkte);
  let schrittAbgehakt = false;
  if (bestanden) {
    const { data: schritt } = await svc
      .from('client_steps')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('step_key', 's_testlead')
      .not('status', 'in', '(erledigt,nicht_noetig)')
      .maybeSingle();
    if (schritt) {
      const warnungen = punkte.filter((p) => p.status === 'warnung').map((p) => p.label);
      await setStepStatus(svc, (schritt as { id: string }).id, 'erledigt', {
        userId: opts.userId,
        kommentar: `Test-Lead automatisch durchgespielt${warnungen.length ? ` (Hinweise: ${warnungen.join(', ')})` : ''}`,
      });
      schrittAbgehakt = true;
    }
  }
  return { bestanden, punkte, schrittAbgehakt };
}
