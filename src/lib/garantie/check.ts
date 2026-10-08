import type { SupabaseClient } from '@supabase/supabase-js';
import { getStagesForAgency, istEingestelltStage } from '@/lib/pipeline/get-stages';
import { createNotification, createNotificationForInternals } from '@/lib/notifications/create';
import { resolveOwner } from '@/lib/fulfillment/engine';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';
import { scoreOf, type SurveyRow } from '@/lib/surveys/analytics';
import {
  AMPEL_LABEL,
  alarmBeiWechsel,
  berechneAmpel,
  faelligeFristen,
  garantieZeitraum,
  type GarantieAmpel,
} from './ampel';

const TAG_MS = 24 * 60 * 60 * 1000;

interface AgenturZeile {
  id: string;
  name: string;
  launch_datum: string | null;
  laufzeit_monate: number | null;
  garantie_start: string | null;
  garantie_ende: string | null;
  garantie_ziel_starter: number | null;
  garantie_ampel: GarantieAmpel | null;
  verlaengerung_erinnert: number[] | null;
  csm_user_id: string | null;
  fulfillment_phase: string | null;
}

/** Eingestellte Starter seit `seit`: Kandidaten, die in eine „Eingestellt“-Phase der Agentur-Pipeline gewechselt sind */
export async function zaehleEingestellt(svc: SupabaseClient, agencyId: string, seit: Date): Promise<number> {
  const stages = await getStagesForAgency(svc, agencyId);
  const hired = stages.filter(istEingestelltStage).map((s) => s.id);
  if (!hired.length) return 0;
  const { data, error } = await svc
    .from('candidate_stages')
    .select('candidate_id, candidates!inner(agency_id)')
    .eq('candidates.agency_id', agencyId)
    .in('stage_id', hired)
    .gte('changed_at', seit.toISOString());
  if (error) throw new Error(`Garantie: Einstellungen nicht ladbar: ${error.message}`);
  return new Set(((data ?? []) as Array<{ candidate_id: string }>).map((r) => r.candidate_id)).size;
}

async function kennzahlen(svc: SupabaseClient, a: AgenturZeile, seit: Date | null, ist: number | null) {
  const ab = (seit ?? new Date(0)).toISOString();
  const [bewerber, termine, umfragen] = await Promise.all([
    svc.from('candidates').select('id', { count: 'exact', head: true }).eq('agency_id', a.id).is('deleted_at', null).gte('created_at', ab),
    svc.from('candidate_appointments').select('id', { count: 'exact', head: true }).eq('agency_id', a.id).neq('status', 'abgesagt').gte('scheduled_at', ab),
    svc.from('survey_responses').select('agency_id, rating, answers, created_at, template_id').eq('agency_id', a.id).gte('created_at', new Date(Date.now() - 90 * TAG_MS).toISOString()),
  ]);
  const scores = ((umfragen.data ?? []) as SurveyRow[]).map(scoreOf).filter((s): s is number => s !== null);
  const zufriedenheit = scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10 : null;
  return {
    bewerber: bewerber.count ?? 0,
    termine: termine.count ?? 0,
    eingestellt: ist,
    zufriedenheit,
  };
}

function datum(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Täglich: Garantie-Ampel je Kunde neu berechnen und speichern.
 * Alarm nur beim Wechsel der Stufe (gelb → Hinweis, rot → Aufgabe + Hinweis); der erste Lauf vermerkt nur den Stand.
 */
export async function runGarantieCheck(svc: SupabaseClient, now: Date = new Date()) {
  const { data, error } = await svc
    .from('agencies')
    .select('id, name, launch_datum, laufzeit_monate, garantie_start, garantie_ende, garantie_ziel_starter, garantie_ampel, verlaengerung_erinnert, csm_user_id, fulfillment_phase')
    .eq('automatik', true) // nur Automatik-Kunden (neue Fulfillment-Strecke)
    .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`);
  if (error) throw new Error(`Garantie: Kunden nicht ladbar: ${error.message}`);

  let berechnet = 0;
  let alarme = 0;
  for (const a of (data ?? []) as AgenturZeile[]) {
    if (a.fulfillment_phase === 'beendet') continue;
    try {
      const { start, ende } = garantieZeitraum(a);
      const ist = start && (a.garantie_ziel_starter ?? 0) > 0 ? await zaehleEingestellt(svc, a.id, start) : 0;
      const erg = berechneAmpel({ start, ende, ziel: a.garantie_ziel_starter, ist, now });

      await svc
        .from('agencies')
        .update({ garantie_ampel: erg.ampel, garantie_ist: ist, garantie_berechnet_am: now.toISOString() })
        .eq('id', a.id);
      berechnet++;

      const alarm = alarmBeiWechsel(a.garantie_ampel, erg.ampel);
      if (!alarm) continue;
      alarme++;
      const titel = `Garantie ${AMPEL_LABEL[erg.ampel].toLowerCase()}: ${a.name}`;
      const text = `${ist} von ${a.garantie_ziel_starter} Startern eingestellt, erwartet bis heute ~${erg.soll}. Garantiezeitraum ${start ? datum(start) : '?'} bis ${ende ? datum(ende) : '?'}.`;
      if (alarm === 'aufgabe') {
        const owner = a.csm_user_id ?? (await resolveOwner(svc, 'csm'));
        await svc.from('internal_tasks').insert({
          title: titel,
          description: `${text}\n\nMaßnahmen prüfen: Budget, Anzeigen, Bewerber-Bearbeitung beim Kunden, Termine/No-Shows.`,
          agency_id: a.id,
          assigned_to: owner,
          status: 'todo',
          priority: 'urgent',
          due_date: datum(now),
        });
        if (owner) {
          await createNotification(svc, { user_id: owner, agency_id: a.id, title: titel, body: text, type: 'system', entity_type: 'agency', entity_id: a.id });
        }
      } else {
        await createNotificationForInternals(svc, { agency_id: a.id, title: titel, body: text, type: 'system', entity_type: 'agency', entity_id: a.id });
      }
    } catch (err) {
      console.error('[garantie] Kunde übersprungen', a.id, err);
    }
  }
  return { berechnet, alarme };
}

/**
 * Täglich: 30 und 14 Tage vor Laufzeitende eine interne Aufgabe „Verlängerung/Upsell-Gespräch“ mit Kennzahlen.
 * Keine Nachricht an den Kunden. Beim ersten Lauf werden schon verstrichene Fristen nur vermerkt.
 */
export async function runVerlaengerungCheck(svc: SupabaseClient, now: Date = new Date()) {
  const { data, error } = await svc
    .from('agencies')
    .select('id, name, launch_datum, laufzeit_monate, garantie_start, garantie_ende, garantie_ziel_starter, garantie_ampel, garantie_ist, verlaengerung_erinnert, csm_user_id, fulfillment_phase')
    .not('garantie_ende', 'is', null)
    .eq('automatik', true) // nur Automatik-Kunden (neue Fulfillment-Strecke)
    .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`);
  if (error) throw new Error(`Verlängerung: Kunden nicht ladbar: ${error.message}`);

  let aufgaben = 0;
  for (const a of (data ?? []) as Array<AgenturZeile & { garantie_ist: number | null }>) {
    if (a.fulfillment_phase === 'beendet' || a.fulfillment_phase === 'offboarding') continue;
    try {
      const ende = new Date(`${String(a.garantie_ende).slice(0, 10)}T00:00:00Z`);
      const tageBisEnde = Math.ceil((ende.getTime() - now.getTime()) / TAG_MS);
      const { neu, vermerken } = faelligeFristen(tageBisEnde, a.verlaengerung_erinnert);

      // Erstmals geprüft: leere Liste speichern, damit spätere Fristen normal greifen
      if (!vermerken.length && a.verlaengerung_erinnert !== null) continue;

      for (const frist of neu) {
        const { start } = garantieZeitraum(a);
        const k = await kennzahlen(svc, a, start, a.garantie_ist);
        const owner = a.csm_user_id ?? (await resolveOwner(svc, 'csm'));
        const titel = `Verlängerung/Upsell-Gespräch: ${a.name} (Laufzeitende in ${tageBisEnde} Tagen)`;
        const zeilen = [
          `Vertrag endet am ${datum(ende)} (Frist ${frist} Tage).`,
          '',
          `Bewerber seit Kampagnenstart: ${k.bewerber}`,
          `Termine: ${k.termine}`,
          `Eingestellt: ${k.eingestellt ?? '–'}${a.garantie_ziel_starter ? ` von ${a.garantie_ziel_starter} (Garantieziel)` : ''}`,
          `Garantie-Ampel: ${a.garantie_ampel ? AMPEL_LABEL[a.garantie_ampel] : '–'}`,
          `Zufriedenheit (90 Tage): ${k.zufriedenheit ?? 'keine Antworten'}`,
        ];
        await svc.from('internal_tasks').insert({
          title: titel,
          description: zeilen.join('\n'),
          agency_id: a.id,
          assigned_to: owner,
          status: 'todo',
          priority: frist <= 14 ? 'urgent' : 'high',
          due_date: datum(new Date(now.getTime() + 3 * TAG_MS)),
        });
        // Vertrieb (Sales-Bereiche) zusätzlich informieren
        const { data: sales } = await svc
          .from('users')
          .select('id')
          .in('role', ['admin', 'employee'])
          .in('funktion', ['vertrieb', 'closer'])
          .neq('aktiv', false);
        const empfaenger = new Set<string>([...(owner ? [owner] : []), ...((sales ?? []) as Array<{ id: string }>).map((u) => u.id)]);
        for (const uid of empfaenger) {
          await createNotification(svc, { user_id: uid, agency_id: a.id, title: titel, body: zeilen[0], type: 'task_assigned', entity_type: 'agency', entity_id: a.id });
        }
        aufgaben++;
      }

      const erinnert = Array.from(new Set([...(a.verlaengerung_erinnert ?? []), ...vermerken])).sort((x, y) => y - x);
      await svc.from('agencies').update({ verlaengerung_erinnert: erinnert }).eq('id', a.id);
    } catch (err) {
      console.error('[verlaengerung] Kunde übersprungen', a.id, err);
    }
  }
  return { aufgaben };
}

/** Einstieg für den täglichen Cron */
export async function runGarantieUndVerlaengerung(svc: SupabaseClient, now: Date = new Date()) {
  const garantie = await runGarantieCheck(svc, now);
  const verlaengerung = await runVerlaengerungCheck(svc, now);
  return { garantie, verlaengerung };
}
