/**
 * Setup baut sich nach dem Onboarding selbst: Sobald ein Kunde das Onboarding-Formular
 * zum ersten Mal abschließt, entstehen ohne Zutun des Teams
 *
 *   1. die Stelle (Job) aus dem Briefing – aktiv, Standard-Stelle für eingehende Leads,
 *   2. die Bot-Konfiguration aus dem Vertriebs-Preset, dem Job zugewiesen,
 *   3. Standard-Verfügbarkeiten (Mo–Fr 9–17 Uhr), damit der Bot Termine anbieten kann,
 *   4. der Start des KI-Generators (Ad-Texte, Video-Skripte, Funnel-Texte, Indeed-Anzeige).
 *
 * Jeder Teil ist einzeln idempotent: Was schon da ist, wird übersprungen, nie überschrieben.
 * Danach bekommt das Team eine Benachrichtigung „Setup automatisch erstellt – bitte prüfen“.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BOT_PRESETS } from '@/lib/bot/presets';
import { generateSlug } from '@/lib/recruiting/slug';
import { ladeBriefing, type Briefing } from '@/lib/indeed/anzeige';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { fuehreGenerierungAus, starteGenerierung } from './generator';
import { resolveOwner } from './engine';

/** Mo–Fr (1–5), 9–17 Uhr in der Zeitzone der Agentur */
export const STANDARD_VERFUEGBARKEIT = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  start_time: '09:00',
  end_time: '17:00',
}));
export const STANDARD_TERMINDAUER = 30;
export const STANDARD_PUFFER = 15;
const STANDARD_TITEL = 'Vertriebsmitarbeiter (m/w/d)';

export interface SetupErgebnis {
  jobId: string | null;
  jobAngelegt: boolean;
  botAngelegt: boolean;
  verfuegbarkeitAngelegt: boolean;
  generatorGestartet: boolean;
  hinweise: string[];
}

/** Job-Felder aus dem Briefing; fehlende Angaben bleiben leer statt erfunden zu werden */
export function jobAusBriefing(b: Briefing | null): {
  title: string;
  location: string | null;
  employment_type: string | null;
  salary_range: string | null;
} {
  const von = b?.verdienst_von ?? null;
  const bis = b?.verdienst_bis ?? null;
  const fmt = (n: number) => `${n.toLocaleString('de-DE')} €`;
  const salary =
    von && bis ? `${fmt(von)} – ${fmt(bis)}` : bis ? `bis ${fmt(bis)}` : von ? `ab ${fmt(von)}` : null;
  return {
    title: (b?.jobtitel?.trim() || STANDARD_TITEL).slice(0, 200),
    location: b?.regionen?.length ? b.regionen.join(', ').slice(0, 200) : null,
    employment_type: b?.anstellungsart?.slice(0, 50) ?? null,
    salary_range: salary,
  };
}

/** Vertriebs-Preset, angepasst ans Briefing (Ansprache, Führerschein-Frage). FAQ bleibt leer –
 *  das Preset enthält Beispiel-Verdienste, die für diesen Kunden nicht stimmen müssen. */
export function botAusBriefing(b: Briefing | null) {
  const preset = BOT_PRESETS.find((p) => p.key === 'vertrieb')!;
  const questions = preset.questions.filter((q) => !(q.key === 'fuehrerschein' && b?.fuehrerschein_noetig === false));
  return {
    config: {
      persona: preset.config.persona,
      tone: preset.config.tone,
      formality: b?.ansprache ?? preset.config.formality,
      intro_text: preset.config.intro_text,
      faq: [] as Array<{ q: string; a: string }>,
    },
    questions,
  };
}

async function eindeutigerSlug(svc: SupabaseClient, agencyId: string, titel: string): Promise<string> {
  const basis = generateSlug(titel);
  const { data } = await svc.from('jobs').select('slug').eq('agency_id', agencyId).like('slug', `${basis}%`);
  const vorhanden = new Set(((data ?? []) as Array<{ slug: string }>).map((j) => j.slug));
  if (!vorhanden.has(basis)) return basis;
  let n = 2;
  while (vorhanden.has(`${basis}-${n}`)) n++;
  return `${basis}-${n}`;
}

/**
 * Setup für einen Kunden anlegen. Wirft nicht – Fehler landen in `hinweise` und im Log,
 * damit der Onboarding-Abschluss des Kunden nie daran scheitert.
 */
export async function richteSetupEin(
  svc: SupabaseClient,
  agencyId: string,
  opts: { generator?: boolean } = {},
): Promise<SetupErgebnis> {
  const erg: SetupErgebnis = {
    jobId: null,
    jobAngelegt: false,
    botAngelegt: false,
    verfuegbarkeitAngelegt: false,
    generatorGestartet: false,
    hinweise: [],
  };

  const [briefing, { data: agency }] = await Promise.all([
    ladeBriefing(svc, agencyId),
    svc.from('agencies').select('name').eq('id', agencyId).maybeSingle(),
  ]);
  if (!agency) {
    erg.hinweise.push('Kunde nicht gefunden');
    return erg;
  }
  const name = (agency as { name: string }).name;

  // 1. Job: vorhandene Standard- bzw. aktive Stelle weiterverwenden, sonst anlegen
  const { data: jobs } = await svc
    .from('jobs')
    .select('id, bot_config_id, is_default, status')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: true });
  type JobRow = { id: string; bot_config_id: string | null; is_default: boolean; status: string };
  const liste = (jobs ?? []) as JobRow[];
  let job = liste.find((j) => j.is_default) ?? liste.find((j) => j.status === 'active') ?? liste[0] ?? null;

  if (!job) {
    const felder = jobAusBriefing(briefing);
    const slug = await eindeutigerSlug(svc, agencyId, felder.title);
    const { data: neu, error } = await svc
      .from('jobs')
      .insert({
        agency_id: agencyId,
        ...felder,
        slug,
        status: 'active',
        is_default: true,
        indeed_mode: 'off',
        appointment_duration_minutes: STANDARD_TERMINDAUER,
        appointment_buffer_minutes: STANDARD_PUFFER,
      })
      .select('id, bot_config_id, is_default, status')
      .single();
    if (error || !neu) {
      erg.hinweise.push(`Stelle konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`);
      console.error('[auto-setup] Job', agencyId, error);
      return erg;
    }
    job = neu as JobRow;
    erg.jobAngelegt = true;
  }
  erg.jobId = job.id;

  // 2. Bot-Konfiguration, falls der Job noch keine hat
  if (!job.bot_config_id) {
    const bot = botAusBriefing(briefing);
    const { data: cfg, error } = await svc
      .from('bot_configs')
      .insert({
        agency_id: agencyId,
        ...bot.config,
        language: 'de',
        allowed_languages: ['de'],
        max_turns: 20,
        handover_rules: {},
        scoring_rules: { a_min: 75, b_min: 50 },
        active: true,
      })
      .select('id')
      .single();
    if (error || !cfg) {
      erg.hinweise.push(`Bot-Konfiguration konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`);
      console.error('[auto-setup] Bot', agencyId, error);
    } else {
      const configId = (cfg as { id: string }).id;
      const { error: qErr } = await svc.from('bot_questions').insert(
        bot.questions.map((q, idx) => ({
          agency_id: agencyId,
          bot_config_id: configId,
          position: idx,
          key: q.key,
          text: q.text,
          type: q.type,
          options: q.options ?? null,
          required: q.required,
          knockout_rule: q.knockout_rule ?? null,
          weight: q.weight,
        })),
      );
      if (qErr) erg.hinweise.push(`Bot-Fragen konnten nicht angelegt werden: ${qErr.message}`);
      const { error: linkErr } = await svc
        .from('jobs')
        .update({ bot_config_id: configId })
        .eq('id', job.id)
        .eq('agency_id', agencyId);
      if (linkErr) erg.hinweise.push(`Bot konnte der Stelle nicht zugewiesen werden: ${linkErr.message}`);
      else erg.botAngelegt = true;
    }
  }

  // 3. Verfügbarkeiten, falls die Stelle noch keine hat
  const { count: regeln } = await svc
    .from('availability_rules')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.id)
    .eq('agency_id', agencyId);
  if (!regeln) {
    const { error } = await svc
      .from('availability_rules')
      .insert(STANDARD_VERFUEGBARKEIT.map((r) => ({ agency_id: agencyId, job_id: job!.id, ...r })));
    if (error) erg.hinweise.push(`Verfügbarkeiten konnten nicht angelegt werden: ${error.message}`);
    else erg.verfuegbarkeitAngelegt = true;
  }

  // 4. KI-Generator – nur, wenn für diesen Kunden noch nie generiert wurde
  if (opts.generator !== false) {
    const { count: frueher } = await svc
      .from('fulfillment_generierungen')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agencyId);
    if (frueher) {
      // schon einmal generiert – nichts doppelt erzeugen
    } else if (!briefing?.jobtitel) {
      erg.hinweise.push('KI-Generator nicht gestartet: Stellenbezeichnung fehlt im Briefing');
    } else if (!process.env.ANTHROPIC_API_KEY) {
      erg.hinweise.push('KI-Generator nicht gestartet: ANTHROPIC_API_KEY fehlt');
    } else {
      try {
        const userId = await resolveOwner(svc, 'media_buyer');
        if (!userId) {
          erg.hinweise.push('KI-Generator nicht gestartet: kein internes Teammitglied gefunden');
        } else {
          const { id: genId, teile } = await starteGenerierung(svc, agencyId, userId, null);
          if (teile.length) {
            erg.generatorGestartet = true;
            await fuehreGenerierungAus(svc, genId, agencyId, userId, teile, null);
          }
        }
      } catch (err) {
        erg.hinweise.push(`KI-Generator: ${err instanceof Error ? err.message : 'Fehler'}`);
      }
    }
  }

  const teile = [
    erg.jobAngelegt && 'Stelle',
    erg.botAngelegt && 'Bot',
    erg.verfuegbarkeitAngelegt && 'Terminzeiten Mo–Fr 9–17',
    erg.generatorGestartet && 'Anzeigen/Skripte/Funnel-Texte per KI',
  ].filter(Boolean);
  if (teile.length || erg.hinweise.length) {
    await createNotificationForInternals(svc, {
      title: `Setup automatisch erstellt – bitte prüfen: ${name}`,
      body: [teile.length ? `Angelegt: ${teile.join(', ')}.` : '', ...erg.hinweise].filter(Boolean).join(' '),
      type: 'system',
      entity_type: 'agency',
      entity_id: agencyId,
      push_url: `/clients/${agencyId}`,
    }).catch((err) => console.error('[auto-setup] Benachrichtigung', err));
  }

  return erg;
}
