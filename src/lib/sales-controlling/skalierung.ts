/**
 * Skalierung: Wie viele Leads und wie viel Werbebudget braucht ein voll ausgelasteter Setter?
 * Basis sind die letzten 14 Tage (Werbekosten laufen auch am Wochenende, Settings nur werktags):
 *   Leads = neue Anfragen in Close (Pipeline „D2D Sales“, ohne Upsell)
 *   gehaltene Settings = Deal geht nach „Setting – Terminiert“ weiter (wie in der Auslastung)
 *   Kosten je Lead = Meta-Werbekosten ÷ Leads
 * Voller Setter = Optimum aus den Auslastungs-Schwellen (gehaltene Settings je Werktag).
 */

import { klassifiziere, type CloseStatus, type MetaZahlen, type Opp, type StatusEvent } from './compute';
import { baueUebergaenge } from './detail';
import { SETTING_GEHALTEN, werktageListe, type Schwellen } from './auslastung';
import { berlinTag } from '@/lib/zeit/berlin';

export const SKALIERUNG_TAGE = 14;
export const VOLUMEN_TAGE = 60;
const TAG = 864e5;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function berechneSkalierung(e: {
  opps: Opp[];
  statuses: CloseStatus[];
  events: StatusEvent[];
  meta: MetaZahlen | null;
  schwellen: Schwellen;
  jetzt: Date;
  /** Monatsziel Auftragsvolumen (z. B. 300.000 €) */
  ziel: number;
}) {
  const heute = berlinTag(e.jetzt);
  const bis = new Date(new Date(heute + 'T12:00:00Z').getTime() + TAG).toISOString().slice(0, 10);
  const von = new Date(new Date(bis + 'T12:00:00Z').getTime() - SKALIERUNG_TAGE * TAG).toISOString().slice(0, 10);
  const drin = (iso: string) => {
    const t = berlinTag(new Date(iso));
    return t >= von && t < bis;
  };
  const werktage = Math.max(1, werktageListe(von, bis, heute).length);

  const leads = e.opps.filter((o) => !o.upsell && drin(o.date_created)).length;
  const { ü } = baueUebergaenge(e.statuses, e.opps, e.events);
  const settings = ü.filter((x) => SETTING_GEHALTEN(x) && drin(x.date)).length;

  const leadsProTag = r1(leads / SKALIERUNG_TAGE);
  const settingsProWerktag = r1(settings / werktage);
  const settingsJeLead = leads > 0 ? settings / leads : null;
  const spend = e.meta?.spend ?? null;
  const spendProTag = spend === null ? null : Math.round(spend / SKALIERUNG_TAGE);
  const kostenJeLead = spend !== null && leads > 0 ? Math.round(spend / leads) : null;

  // Voller Setter: Optimum je Werktag → Leads je Kalendertag (Werbung läuft 7 Tage)
  const zielSettingsWoche = e.schwellen.settingOptimal * 5;
  const leadsFuerSetter = settingsJeLead ? Math.ceil(zielSettingsWoche / 7 / settingsJeLead) : null;
  const budgetFuerSetter = leadsFuerSetter !== null && kostenJeLead !== null ? leadsFuerSetter * kostenJeLead : null;

  // Weg zum Monatsziel: Volumen je Lead aus 60 Tagen (Closings brauchen länger als 14 Tage)
  const vonLang = new Date(new Date(bis + 'T12:00:00Z').getTime() - VOLUMEN_TAGE * TAG).toISOString().slice(0, 10);
  const drinLang = (iso: string) => {
    const t = berlinTag(new Date(iso));
    return t >= vonLang && t < bis;
  };
  const statusById = new Map(e.statuses.map((x) => [x.id, x]));
  const gewonnen = e.opps.filter((o) => klassifiziere(statusById.get(o.status_id)) === 'won' && drinLang(o.date_won ?? o.date_created));
  const neuVolumen = gewonnen.filter((o) => !o.upsell).reduce((sum, o) => sum + o.value, 0);
  const upsellProMonat = Math.round((gewonnen.filter((o) => o.upsell).reduce((sum, o) => sum + o.value, 0) / VOLUMEN_TAGE) * 30);
  const leadsLang = e.opps.filter((o) => !o.upsell && drinLang(o.date_created)).length;
  const volumenJeLead = leadsLang > 0 && neuVolumen > 0 ? Math.round(neuVolumen / leadsLang) : null;
  const neuNoetig = Math.max(0, e.ziel - upsellProMonat);
  const zielLeadsProTag = volumenJeLead ? Math.ceil(neuNoetig / volumenJeLead / 30) : null;
  const zielBudgetProTag = zielLeadsProTag !== null && kostenJeLead !== null ? zielLeadsProTag * kostenJeLead : null;
  const zielSetter = zielLeadsProTag !== null && leadsFuerSetter ? r1(zielLeadsProTag / leadsFuerSetter) : null;

  return {
    ziel: {
      betrag: e.ziel,
      volumenTage: VOLUMEN_TAGE,
      volumenJeLead,
      upsellProMonat,
      leadsProTag: zielLeadsProTag,
      budgetProTag: zielBudgetProTag,
      budgetProMonat: zielBudgetProTag === null ? null : zielBudgetProTag * 30,
      setter: zielSetter,
    },
    tage: SKALIERUNG_TAGE,
    werktage,
    leads,
    leadsProTag,
    settings,
    settingsProWerktag,
    /** gehaltene Settings je Lead in % */
    settingQuote: settingsJeLead === null ? null : r1(settingsJeLead * 100),
    spend,
    spendProTag,
    kostenJeLead,
    setterOptimum: e.schwellen.settingOptimal,
    leadsFuerSetter,
    budgetFuerSetter,
    mehrBudgetProTag: budgetFuerSetter !== null && spendProTag !== null ? Math.max(0, budgetFuerSetter - spendProTag) : null,
    /** Auslastung eines Setters mit dem heutigen Lead-Eingang */
    auslastungProzent: e.schwellen.settingOptimal > 0 ? Math.round((settingsProWerktag / e.schwellen.settingOptimal) * 100) : null,
  };
}

export type Skalierung = ReturnType<typeof berechneSkalierung>;
