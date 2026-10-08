/**
 * Zufriedenheits-Umfragen: wann welche Umfrage fällig ist, welche Vorlage dazu gehört
 * und was aus einer Antwort folgt. Reine Funktionen – Datenbank und Versand liegen in versand.ts.
 *
 *   Tag 0   nach Onboarding  → Onboarding-Feedback
 *   Tag 7   nach Onboarding  → Erste Eindrücke
 *   alle 14 Tage danach      → Kundenzufriedenheit (2-Wochen-Check)
 *   jedes Quartal ab Tag 90  → Gesamtbewertung
 */

/** Nichts, was vor diesem Zeitpunkt fällig war, wird geplant oder verschickt (kein Nachholen nach dem Deploy). */
export const UMFRAGEN_AB = new Date('2026-10-09T00:00:00Z');

const TAG = 86_400_000;

export type VorlagenSchluessel = 'onboarding' | 'erste_eindruecke' | 'zufriedenheit' | 'gesamt';

/** Titel-Präfixe der Vorlagen – live heißt z. B. die 2-Wochen-Vorlage „Kundenzufriedenheit (2-Wochen-Check)“ */
const VORLAGEN_PRAEFIX: Record<VorlagenSchluessel, string> = {
  onboarding: 'onboarding-feedback',
  erste_eindruecke: 'erste eindrücke',
  zufriedenheit: 'kundenzufriedenheit',
  gesamt: 'gesamtbewertung',
};

const norm = (s: string) => s.normalize('NFC').trim().toLowerCase();

export function findeVorlage(
  vorlagen: Array<{ id: string; title: string; active?: boolean | null }>,
  schluessel: VorlagenSchluessel,
): string | null {
  const praefix = VORLAGEN_PRAEFIX[schluessel];
  const passend = vorlagen.filter((v) => v.active !== false && norm(v.title).startsWith(praefix));
  return passend[0]?.id ?? null;
}

export interface FaelligeUmfrage {
  trigger_key: string;
  vorlage: VorlagenSchluessel;
  /** Fälligkeitszeitpunkt – wird als scheduled_at gespeichert */
  faellig: Date;
}

/**
 * Welche Umfragen für einen Kunden jetzt neu einzuplanen sind.
 * Es wird nur geplant, was bis `now` fällig ist UND nicht vor `ab` lag – verpasste Zeitpunkte
 * von Bestandskunden werden übersprungen statt nachgeholt.
 */
export function faelligeUmfragen(params: {
  onboardingAm: Date | null;
  now: Date;
  vorhandeneKeys: Set<string>;
  ab?: Date;
}): FaelligeUmfrage[] {
  const { onboardingAm, now, vorhandeneKeys } = params;
  const ab = params.ab ?? UMFRAGEN_AB;
  if (!onboardingAm) return [];
  const out: FaelligeUmfrage[] = [];
  const pruefe = (trigger_key: string, vorlage: VorlagenSchluessel, faellig: Date) => {
    if (faellig > now || faellig < ab || vorhandeneKeys.has(trigger_key)) return;
    out.push({ trigger_key, vorlage, faellig });
  };

  const basis = onboardingAm.getTime();
  pruefe('post_onboarding', 'onboarding', new Date(basis));
  pruefe('erste_eindruecke', 'erste_eindruecke', new Date(basis + 7 * TAG));

  // 2-Wochen-Check: nur der aktuelle Zeitraum, ältere gelten als verpasst
  const perioden = Math.floor((now.getTime() - basis) / (14 * TAG));
  if (perioden >= 1) pruefe(`biweekly_${perioden}`, 'zufriedenheit', new Date(basis + perioden * 14 * TAG));

  // Quartal: ab Tag 90 nach Onboarding, fällig zum Quartalsbeginn bzw. Tag 90, je nachdem was später liegt
  if (now.getTime() - basis >= 90 * TAG) {
    const q = Math.floor(now.getUTCMonth() / 3);
    const quartalsbeginn = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1));
    const tag90 = new Date(basis + 90 * TAG);
    pruefe(`quarterly_${now.getUTCFullYear()}_Q${q + 1}`, 'gesamt', quartalsbeginn > tag90 ? quartalsbeginn : tag90);
  }
  return out;
}

/* ── Antworten ───────────────────────────────────────────────────────────── */

export interface Frage {
  id: string;
  type: 'rating' | 'choice' | 'text' | 'nps';
  label: string;
  options?: string[];
}

export type Antworten = Record<string, string | number>;

/** Nur Antworten auf echte Fragen der Vorlage, in gültigem Wertebereich */
export function pruefeAntworten(fragen: Frage[], roh: unknown): Antworten {
  const eingabe = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
  const out: Antworten = {};
  for (const f of fragen) {
    const v = eingabe[f.id];
    if (v === undefined || v === null || v === '') continue;
    if (f.type === 'rating' && Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5) out[f.id] = v as number;
    else if (f.type === 'nps' && Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10) out[f.id] = v as number;
    else if (f.type === 'choice' && typeof v === 'string' && (f.options ?? []).includes(v)) out[f.id] = v;
    else if (f.type === 'text' && typeof v === 'string') out[f.id] = v.trim().slice(0, 2000);
  }
  return out;
}

/** Gesamtnote 1–5: Frage „overall“, sonst Mittel aller Sternefragen */
export function gesamtnote(fragen: Frage[], antworten: Antworten): number | null {
  if (typeof antworten.overall === 'number') return antworten.overall;
  const sterne = fragen.filter((f) => f.type === 'rating').map((f) => antworten[f.id]).filter((v): v is number => typeof v === 'number');
  return sterne.length ? sterne.reduce((a, b) => a + b, 0) / sterne.length : null;
}

export interface Folgen {
  kritisch: boolean;
  empfehlung: boolean;
  upsell: boolean;
  gruende: string[];
}

/** Was aus einer Antwort folgt: Betreuer anrufen lassen, Empfehlung anfragen, Upsell an den Vertrieb */
export function folgenAusAntwort(fragen: Frage[], antworten: Antworten): Folgen {
  const gruende: string[] = [];
  const note = gesamtnote(fragen, antworten);
  let kritisch = false;
  if (note !== null && note <= 3) {
    kritisch = true;
    gruende.push(`Note ${Math.round(note * 10) / 10} von 5`);
  }
  if (['Unsicher', 'Eher nicht'].includes(String(antworten.weiter_zusammenarbeit ?? ''))) {
    kritisch = true;
    gruende.push(`Weiterarbeit: „${antworten.weiter_zusammenarbeit}“`);
  }
  if (antworten.roi === 'Eher nein') {
    kritisch = true;
    gruende.push('Investition hat sich eher nicht gelohnt');
  }
  const nps = typeof antworten.nps === 'number' ? antworten.nps : null;
  const empfehlung = !kritisch && nps !== null && nps >= 9;
  const upsell =
    antworten.mehr_bewerber === 'Ja, locker' ||
    antworten.weitere_regionen === 'Ja, auf jeden Fall' ||
    /^ja\b/i.test(String(antworten.budget_erhoehen ?? ''));
  return { kritisch, empfehlung, upsell, gruende };
}
