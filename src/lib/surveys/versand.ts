/**
 * Umfragen einplanen, per Mail mit persönlichem Link (ohne Login) verschicken und Antworten
 * verarbeiten – inklusive Folge-Aufgaben fürs Team. Planung/Regeln: planung.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications/create';
import { resolveOwner } from '@/lib/fulfillment/engine';
import {
  UMFRAGEN_AB,
  faelligeUmfragen,
  findeVorlage,
  folgenAusAntwort,
  pruefeAntworten,
  type Frage,
} from './planung';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';

export const umfrageLink = (token: string) => `${APP_URL()}/umfrage/${token}`;

/** Fällige Umfragen für alle Kunden mit abgeschlossenem Onboarding einplanen */
export async function planeUmfragen(
  svc: SupabaseClient,
  agencies: Array<{ id: string; onboarding_completed: boolean | null; created_at: string }>,
  now: Date = new Date(),
): Promise<number> {
  const aktive = agencies.filter((a) => a.onboarding_completed);
  if (!aktive.length) return 0;
  const ids = aktive.map((a) => a.id);

  const [{ data: vorlagen }, { data: logs }, { data: vorhanden }] = await Promise.all([
    svc.from('survey_templates').select('id, title, active'),
    svc
      .from('activity_log')
      .select('agency_id, created_at')
      .eq('action_type', 'onboarding_complete')
      .in('agency_id', ids)
      .order('created_at', { ascending: true }),
    svc.from('survey_schedule').select('agency_id, trigger_key').in('agency_id', ids),
  ]);

  const onboardingAm = new Map<string, Date>();
  for (const l of (logs ?? []) as Array<{ agency_id: string; created_at: string }>) {
    if (!onboardingAm.has(l.agency_id)) onboardingAm.set(l.agency_id, new Date(l.created_at));
  }
  const keys = new Map<string, Set<string>>();
  for (const s of (vorhanden ?? []) as Array<{ agency_id: string; trigger_key: string }>) {
    if (!keys.has(s.agency_id)) keys.set(s.agency_id, new Set());
    keys.get(s.agency_id)!.add(s.trigger_key);
  }

  const zeilen: Array<Record<string, unknown>> = [];
  for (const a of aktive) {
    // Ohne Abschluss-Eintrag gilt das Anlagedatum – bei Bestandskunden liegt das vor dem Stichtag, es wird also nichts nachgeholt
    const basis = onboardingAm.get(a.id) ?? new Date(a.created_at);
    for (const f of faelligeUmfragen({ onboardingAm: basis, now, vorhandeneKeys: keys.get(a.id) ?? new Set() })) {
      const templateId = findeVorlage((vorlagen ?? []) as Array<{ id: string; title: string; active: boolean }>, f.vorlage);
      if (!templateId) continue;
      zeilen.push({ agency_id: a.id, trigger_key: f.trigger_key, template_id: templateId, scheduled_at: f.faellig.toISOString() });
    }
  }
  if (!zeilen.length) return 0;
  const { error } = await svc.from('survey_schedule').insert(zeilen);
  if (error) {
    console.error('[umfragen] Einplanen fehlgeschlagen', error);
    return 0;
  }
  return zeilen.length;
}

/**
 * Eingeplante, noch nicht verschickte Umfragen per Mail mit persönlichem Link verschicken.
 * Nur Zeitpunkte ab dem Stichtag – ältere, nie verschickte Einträge bleiben liegen.
 */
export async function versendeUmfragen(
  svc: SupabaseClient,
  ownerByAgency: Map<string, { email: string; name: string }>,
  now: Date = new Date(),
  senden: (to: string, name: string, titel: string, link: string) => Promise<{ error?: unknown } | unknown> = async (to, name, titel, link) => {
    const { sendSurveyNotification } = await import('@/lib/email/resend');
    return sendSurveyNotification(to, name, titel, link);
  },
): Promise<number> {
  const { data: offen, error } = await svc
    .from('survey_schedule')
    .select('id, agency_id, token, survey_templates(title)')
    .is('sent_at', null)
    .is('completed_at', null)
    .gte('scheduled_at', UMFRAGEN_AB.toISOString())
    .lte('scheduled_at', now.toISOString())
    .limit(200);
  if (error) {
    console.error('[umfragen] Offene Umfragen nicht ladbar', error);
    return 0;
  }

  let versendet = 0;
  for (const s of (offen ?? []) as unknown as Array<{ id: string; agency_id: string; token: string; survey_templates: { title: string } | null }>) {
    const empfaenger = ownerByAgency.get(s.agency_id);
    if (!empfaenger?.email) continue;
    const titel = s.survey_templates?.title ?? 'Feedback-Check';
    try {
      const res = (await senden(empfaenger.email, empfaenger.name, titel, umfrageLink(s.token))) as { error?: unknown } | null;
      if (res && typeof res === 'object' && 'error' in res && res.error) throw res.error;
      await svc.from('survey_schedule').update({ sent_at: new Date().toISOString() }).eq('id', s.id).is('sent_at', null);
      versendet++;
    } catch (err) {
      console.error('[umfragen] Versand fehlgeschlagen', s.id, err);
    }
  }
  return versendet;
}

/* ── Antwort über den persönlichen Link ──────────────────────────────────── */

export interface UmfrageAnsicht {
  status: 'offen' | 'erledigt';
  titel: string;
  beschreibung: string | null;
  kunde: string;
  fragen: Frage[];
}

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ScheduleMitVorlage = {
  id: string;
  agency_id: string;
  template_id: string;
  completed_at: string | null;
  survey_templates: { title: string; description: string | null; questions: Frage[] } | null;
  agencies: { name: string } | null;
};

async function ladeNachToken(svc: SupabaseClient, token: string): Promise<ScheduleMitVorlage | null> {
  if (!TOKEN_RE.test(token)) return null;
  const { data } = await svc
    .from('survey_schedule')
    .select('id, agency_id, template_id, completed_at, survey_templates(title, description, questions), agencies(name)')
    .eq('token', token)
    .maybeSingle();
  return (data as unknown as ScheduleMitVorlage | null) ?? null;
}

export async function ladeUmfrage(svc: SupabaseClient, token: string): Promise<UmfrageAnsicht | null> {
  const s = await ladeNachToken(svc, token);
  if (!s?.survey_templates) return null;
  return {
    status: s.completed_at ? 'erledigt' : 'offen',
    titel: s.survey_templates.title,
    beschreibung: s.survey_templates.description ?? null,
    kunde: s.agencies?.name ?? '',
    fragen: s.survey_templates.questions ?? [],
  };
}

export type AntwortErgebnis = { ok: true } | { ok: false; status: number; error: string };

export async function beantworteUmfrage(
  svc: SupabaseClient,
  token: string,
  roh: unknown,
  kommentar: unknown,
): Promise<AntwortErgebnis> {
  const s = await ladeNachToken(svc, token);
  if (!s?.survey_templates) return { ok: false, status: 404, error: 'Umfrage nicht gefunden' };
  if (s.completed_at) return { ok: false, status: 409, error: 'Diese Umfrage wurde bereits beantwortet' };

  const fragen = s.survey_templates.questions ?? [];
  const antworten = pruefeAntworten(fragen, roh);
  if (!Object.keys(antworten).length) return { ok: false, status: 400, error: 'Bitte mindestens eine Frage beantworten' };

  // Atomar beanspruchen: nur eine Antwort pro Link, auch bei Doppelklick
  const jetzt = new Date().toISOString();
  const { data: claim } = await svc
    .from('survey_schedule')
    .update({ completed_at: jetzt })
    .eq('id', s.id)
    .is('completed_at', null)
    .select('id');
  if (!claim?.length) return { ok: false, status: 409, error: 'Diese Umfrage wurde bereits beantwortet' };

  const overall = typeof antworten.overall === 'number' ? antworten.overall : null;
  const { data: resp, error } = await svc
    .from('survey_responses')
    .insert({
      template_id: s.template_id,
      agency_id: s.agency_id,
      user_id: null,
      rating: overall,
      answers: antworten,
      comment: typeof kommentar === 'string' && kommentar.trim() ? kommentar.trim().slice(0, 2000) : null,
    })
    .select('id')
    .single();
  if (error || !resp) {
    await svc.from('survey_schedule').update({ completed_at: null }).eq('id', s.id);
    console.error('[umfragen] Antwort nicht gespeichert', error);
    return { ok: false, status: 500, error: 'Antwort konnte nicht gespeichert werden' };
  }
  await svc.from('survey_schedule').update({ response_id: (resp as { id: string }).id }).eq('id', s.id);

  await legeFolgeAufgabenAn(svc, s.agency_id, s.agencies?.name ?? 'Kunde', s.survey_templates.title, fragen, antworten).catch((err) =>
    console.error('[umfragen] Folge-Aufgaben fehlgeschlagen', err),
  );
  return { ok: true };
}

async function vertriebsPerson(svc: SupabaseClient): Promise<string | null> {
  const { data } = await svc
    .from('users')
    .select('id')
    .in('role', ['admin', 'employee'])
    .in('funktion', ['vertrieb', 'closer'])
    .neq('aktiv', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? resolveOwner(svc, 'csm');
}

export async function legeFolgeAufgabenAn(
  svc: SupabaseClient,
  agencyId: string,
  kunde: string,
  umfrage: string,
  fragen: Frage[],
  antworten: Record<string, string | number>,
): Promise<number> {
  const f = folgenAusAntwort(fragen, antworten);
  if (!f.kritisch && !f.empfehlung && !f.upsell) return 0;

  const { data: ag } = await svc.from('agencies').select('csm_user_id').eq('id', agencyId).maybeSingle();
  const betreuer = (ag as { csm_user_id: string | null } | null)?.csm_user_id ?? (await resolveOwner(svc, 'csm'));
  const heute = new Date().toISOString().slice(0, 10);
  const inTagen = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  const aufgaben: Array<{ title: string; description: string; assigned_to: string | null; priority: string; due_date: string }> = [];
  if (f.kritisch) {
    aufgaben.push({
      title: `${kunde} anrufen – kritisches Feedback`,
      description: `Umfrage „${umfrage}“: ${f.gruende.join(', ')}. Heute anrufen und klären.`,
      assigned_to: betreuer,
      priority: 'high',
      due_date: heute,
    });
  }
  if (f.empfehlung) {
    aufgaben.push({
      title: `${kunde}: Empfehlung bzw. Google-Bewertung anfragen`,
      description: `Umfrage „${umfrage}“: Weiterempfehlung ${antworten.nps}/10. Jetzt um Bewertung oder Empfehlung bitten.`,
      assigned_to: betreuer,
      priority: 'medium',
      due_date: inTagen(2),
    });
  }
  if (f.upsell) {
    aufgaben.push({
      title: `${kunde}: Upsell ansprechen`,
      description: `Umfrage „${umfrage}“: Kunde signalisiert Bedarf (mehr Bewerber / weitere Regionen / mehr Budget).`,
      assigned_to: await vertriebsPerson(svc),
      priority: 'medium',
      due_date: inTagen(3),
    });
  }

  const { error } = await svc
    .from('internal_tasks')
    .insert(aufgaben.map((a) => ({ ...a, agency_id: agencyId, status: 'todo' })));
  if (error) throw error;

  for (const a of aufgaben) {
    if (!a.assigned_to) continue;
    await createNotification(svc, {
      user_id: a.assigned_to,
      agency_id: agencyId,
      title: a.title,
      body: a.description,
      type: 'task_assigned',
      entity_type: 'agency',
      entity_id: agencyId,
      push_url: '/tasks',
    }).catch(() => {});
  }
  return aufgaben.length;
}
