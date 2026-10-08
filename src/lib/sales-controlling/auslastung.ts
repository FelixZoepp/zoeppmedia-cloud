/**
 * Sales-Controlling je Person und Tag + Auslastungsampel für Setter und Closer.
 * Rein (keine I/O) – Schwellen kommen als Parameter (Standard unten, überschreibbar über system_einstellungen).
 *
 * Zuordnung zu Personen:
 * - Anwahlen: user_id des Anrufs in Close
 * - Settings/Closings gehalten, No-Show-Rückholung, Follow-ups vorwärts: user_id des Statuswechsels
 *   (wer den Deal in Close weitergeschoben hat)
 * - Setting-Follow-up-Anwahlen: Anwahl auf einen Lead, dessen Deal zum Anrufzeitpunkt in
 *   „Setting - Follow Up“ oder „Setting - No Show“ stand (Status aus den Statuswechseln rekonstruiert)
 */

import { berlinTag } from '@/lib/zeit/berlin';
import { baueUebergaenge, istAusgehend, istGespraech, type Anruf, type Übergang } from './detail';
import { istClosingGebucht, istClosingGehalten, type CloseStatus, type Opp, type StatusEvent, type Stufe } from './compute';

export interface Schwellen {
  /** Settings/Tag: darunter nicht ausgelastet */
  settingMin: number;
  /** Settings/Tag: optimal (±1 gilt als optimal) */
  settingOptimal: number;
  /** Settings/Tag: ab hier „fast voll“ */
  settingVoll: number;
  /** Settings/Tag: darüber überlastet */
  settingMax: number;
  /** Theoretische Obergrenze: 8 h − 1 h Pause, 15 Min. je Setting */
  settingKapazitaet: number;
  /** Setting-Follow-up-Anwahlen/Tag: Mindestmaß */
  followupsMin: number;
  /** Closings/Tag: darunter nicht ausgelastet */
  closingMin: number;
  /** Closings/Tag: obere Grenze des Optimums */
  closingOptimal: number;
  /** Closings/Tag: ab hier überlastet */
  closingUeberlastet: number;
}

export const STANDARD_SCHWELLEN: Schwellen = {
  settingMin: 10,
  settingOptimal: 15,
  settingVoll: 17,
  settingMax: 20,
  settingKapazitaet: 32,
  followupsMin: 50,
  closingMin: 6,
  closingOptimal: 7,
  closingUeberlastet: 10,
};

/** Keys in system_einstellungen → Feld in Schwellen */
export const SCHWELLEN_KEYS: Record<string, keyof Schwellen> = {
  vertrieb_setting_min: 'settingMin',
  vertrieb_setting_optimal: 'settingOptimal',
  vertrieb_setting_voll: 'settingVoll',
  vertrieb_setting_max: 'settingMax',
  vertrieb_setting_kapazitaet: 'settingKapazitaet',
  vertrieb_followups_min: 'followupsMin',
  vertrieb_closing_min: 'closingMin',
  vertrieb_closing_optimal: 'closingOptimal',
  vertrieb_closing_ueberlastet: 'closingUeberlastet',
};

/** Schwellen aus system_einstellungen-Zeilen ableiten (ungültige Werte werden ignoriert) */
export function schwellenAus(zeilen: Array<{ key: string; wert: string | null }>): Schwellen {
  const s = { ...STANDARD_SCHWELLEN };
  for (const z of zeilen) {
    const feld = SCHWELLEN_KEYS[z.key];
    const n = Number(z.wert);
    if (feld && z.wert !== null && z.wert !== '' && Number.isFinite(n) && n >= 0) s[feld] = n;
  }
  return s;
}

export type Ampel = 'leer' | 'nicht_ausgelastet' | 'okay' | 'optimal' | 'fast_voll' | 'ueberlastet';

export const AMPEL_LABEL: Record<Ampel, string> = {
  leer: '–',
  nicht_ausgelastet: 'nicht ausgelastet',
  okay: 'okay',
  optimal: 'optimal',
  fast_voll: 'fast voll',
  ueberlastet: 'überlastet',
};

/** Setter-Ampel für gehaltene Settings pro Tag (oder Ø) */
export function ampelSetting(n: number | null, s: Schwellen = STANDARD_SCHWELLEN): Ampel {
  if (n === null) return 'leer';
  if (n > s.settingMax) return 'ueberlastet';
  if (n >= s.settingVoll) return 'fast_voll';
  if (n >= s.settingOptimal - 1 && n <= s.settingOptimal + 1) return 'optimal';
  if (n > s.settingOptimal + 1) return 'fast_voll';
  if (n >= s.settingMin) return 'okay';
  return 'nicht_ausgelastet';
}

/** Closer-Ampel für gehaltene Closings pro Tag (oder Ø) */
export function ampelClosing(n: number | null, s: Schwellen = STANDARD_SCHWELLEN): Ampel {
  if (n === null) return 'leer';
  if (n >= s.closingUeberlastet) return 'ueberlastet';
  if (n > s.closingOptimal) return 'fast_voll';
  if (n >= s.closingMin) return 'optimal';
  return 'nicht_ausgelastet';
}

const TAG = 864e5;
const r1 = (n: number) => Math.round(n * 10) / 10;
const quote = (a: number, b: number) => (b > 0 ? r1((a / b) * 100) : null);

/** Kalendertag (Berlin) eines Zeitpunkts */
const tagVon = (iso: string) => berlinTag(new Date(iso));
const istWerktag = (tag: string) => {
  const wd = new Date(tag + 'T12:00:00Z').getUTCDay();
  return wd !== 0 && wd !== 6;
};

/** Werktage (Mo–Fr) im Bereich [von, bis), höchstens bis heute (Berlin) */
export function werktageListe(von: string, bis: string, heute: string): string[] {
  const ende = bis <= heute ? bis : new Date(new Date(heute + 'T12:00:00Z').getTime() + TAG).toISOString().slice(0, 10);
  const tage: string[] = [];
  for (let t = new Date(von + 'T12:00:00Z').getTime(); ; t += TAG) {
    const tag = new Date(t).toISOString().slice(0, 10);
    if (tag >= ende) break;
    if (istWerktag(tag)) tage.push(tag);
  }
  return tage;
}

/** Die letzten n Werktage bis einschließlich heute (Berlin) */
export function letzteWerktage(heute: string, n: number): string[] {
  const tage: string[] = [];
  for (let t = new Date(heute + 'T12:00:00Z').getTime(); tage.length < n; t -= TAG) {
    const tag = new Date(t).toISOString().slice(0, 10);
    if (istWerktag(tag)) tage.unshift(tag);
  }
  return tage;
}

export const SETTING_GEHALTEN = (x: Pick<Übergang, 'von' | 'nach'>) => x.von === 'setting' && !['setting', 'setting_noshow', 'andere'].includes(x.nach);
export const CC2_GEHALTEN = (x: Pick<Übergang, 'von' | 'nach'>) => x.von === 'cc2' && ['closing_followup', 'angebot', 'won', 'lost'].includes(x.nach);
export const CLOSING_GEHALTEN = (x: Pick<Übergang, 'von' | 'nach'>) => istClosingGehalten(x) || CC2_GEHALTEN(x);
const SETTING_GEBUCHT = (x: Pick<Übergang, 'von' | 'nach'>) => x.nach === 'setting' && x.von !== 'setting';
const CLOSING_GEBUCHT = (x: Pick<Übergang, 'von' | 'nach'>) => istClosingGebucht(x) || (x.nach === 'cc2' && x.von !== 'cc2');

const RUECKHOL_ZIELE: Partial<Record<Stufe, Stufe[]>> = {
  setting_noshow: ['setting', 'closing', 'cc2'],
  closing_noshow: ['closing', 'cc2'],
};
const FU_VORWAERTS: Stufe[] = ['setting', 'closing', 'cc2', 'angebot', 'won'];
const FU_STUFEN_SETTING: Stufe[] = ['setting_followup', 'setting_noshow'];

export interface AuslastungEingaben {
  statuses: CloseStatus[];
  opps: Opp[];
  events: StatusEvent[];
  anrufe: Anruf[];
  /** offene Close-Aufgaben (Follow-ups) */
  aufgaben: Array<{ assigned_to: string | null; due_date: string | null }>;
  /** erledigte Close-Aufgaben (fällig im Zeitraum), null = nicht geladen */
  erledigteAufgaben: Array<{ assigned_to: string | null; due_date: string | null }> | null;
  users: Map<string, string>;
  zeitraum: { von: string; bis: string };
  jetzt: Date;
  schwellen?: Schwellen;
}

/** Höchstens so viele Tagesspalten (die letzten Werktage des Zeitraums) */
export const MAX_TAGESSPALTEN = 23;

type ProTag = Record<string, number>;
const plus = (m: ProTag, tag: string, n = 1) => {
  m[tag] = (m[tag] ?? 0) + n;
};

export function berechneAuslastung(e: AuslastungEingaben) {
  const s = e.schwellen ?? STANDARD_SCHWELLEN;
  const heute = berlinTag(e.jetzt);
  const { ü, stufe, evByOpp } = baueUebergaenge(e.statuses, e.opps, e.events);
  const tagDrin = (tag: string) => tag >= e.zeitraum.von && tag < e.zeitraum.bis;
  const name = (id: string | null) => (id ? e.users.get(id) ?? 'Unbekannt' : 'Ohne Zuordnung');
  const key = (id: string | null) => id ?? '–';

  const alleTage = werktageListe(e.zeitraum.von, e.zeitraum.bis, heute);
  const tage = alleTage.slice(-MAX_TAGESSPALTEN);
  const werktageAnzahl = Math.max(1, alleTage.length);

  /* ── Status eines Deals zu einem Zeitpunkt rekonstruieren ───── */
  const verlauf = new Map<string, Array<{ date: string; status: string }>>();
  const startStatus = new Map<string, string>();
  for (const o of e.opps) {
    const evs = [...(evByOpp.get(o.id) ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    startStatus.set(o.id, evs[0]?.old_status_id ?? o.status_id);
    verlauf.set(o.id, evs.map((x) => ({ date: x.date, status: x.new_status_id })));
  }
  const statusZu = (o: Opp, zeit: string): string | null => {
    if (zeit < o.date_created) return null;
    let st = startStatus.get(o.id) ?? o.status_id;
    for (const v of verlauf.get(o.id) ?? []) {
      if (v.date > zeit) break;
      st = v.status;
    }
    return st;
  };
  const oppsJeLead = new Map<string, Opp[]>();
  for (const o of e.opps) oppsJeLead.set(o.lead_id, [...(oppsJeLead.get(o.lead_id) ?? []), o]);
  const istSettingFollowupAnruf = (a: Anruf) =>
    !!a.lead_id && (oppsJeLead.get(a.lead_id) ?? []).some((o) => {
      const st = statusZu(o, a.date);
      const sf = st ? stufe(st) : null;
      return sf !== null && FU_STUFEN_SETTING.includes(sf);
    });

  /* ── Personen sammeln ──────────────────────────────────────── */
  interface P {
    id: string | null;
    anwahlen: ProTag;
    gespraeche: ProTag;
    fuAnwahlen: ProTag;
    settings: ProTag;
    closings: ProTag;
    anwahlenGesamt: number;
    gespraecheGesamt: number;
    fuAnwahlenGesamt: number;
    settingsGesamt: number;
    closingsGesamt: number;
    settingsWerktage: number;
    closingsWerktage: number;
    noShowsGesetzt: number;
    rueckgeholt: Array<{ lead: string; von: Stufe; nach: Stufe; datum: string }>;
    fuVorwaerts: number;
    fuVerloren: number;
    aufgabenOffen: number;
    aufgabenUeberfaellig: number;
    aufgabenErledigt: number;
  }
  const personen = new Map<string, P>();
  const p = (id: string | null): P => {
    const k = key(id);
    let x = personen.get(k);
    if (!x) {
      x = {
        id, anwahlen: {}, gespraeche: {}, fuAnwahlen: {}, settings: {}, closings: {},
        anwahlenGesamt: 0, gespraecheGesamt: 0, fuAnwahlenGesamt: 0, settingsGesamt: 0, closingsGesamt: 0,
        settingsWerktage: 0, closingsWerktage: 0, noShowsGesetzt: 0, rueckgeholt: [],
        fuVorwaerts: 0, fuVerloren: 0, aufgabenOffen: 0, aufgabenUeberfaellig: 0, aufgabenErledigt: 0,
      };
      personen.set(k, x);
    }
    return x;
  };

  // Anwahlen (ausgehend) im Zeitraum
  for (const a of e.anrufe) {
    if (!istAusgehend(a)) continue;
    const tag = tagVon(a.date);
    if (!tagDrin(tag)) continue;
    const x = p(a.user_id);
    plus(x.anwahlen, tag);
    x.anwahlenGesamt++;
    if (istGespraech(a)) {
      plus(x.gespraeche, tag);
      x.gespraecheGesamt++;
    }
    if (istSettingFollowupAnruf(a)) {
      plus(x.fuAnwahlen, tag);
      x.fuAnwahlenGesamt++;
    }
  }

  // Statuswechsel im Zeitraum
  const leadName = new Map(e.opps.map((o) => [o.id, o.lead_name || 'Lead']));
  for (const x of ü) {
    const tag = tagVon(x.date);
    if (!tagDrin(tag)) continue;
    if (SETTING_GEHALTEN(x)) {
      const per = p(x.user_id);
      plus(per.settings, tag);
      per.settingsGesamt++;
      if (istWerktag(tag)) per.settingsWerktage++;
    }
    if (CLOSING_GEHALTEN(x)) {
      const per = p(x.user_id);
      plus(per.closings, tag);
      per.closingsGesamt++;
      if (istWerktag(tag)) per.closingsWerktage++;
    }
    if ((x.nach === 'setting_noshow' && x.von !== 'setting_noshow') || (x.nach === 'closing_noshow' && x.von !== 'closing_noshow')) p(x.user_id).noShowsGesetzt++;
    const ziele = x.von ? RUECKHOL_ZIELE[x.von] : undefined;
    if (ziele && ziele.includes(x.nach)) p(x.user_id).rueckgeholt.push({ lead: leadName.get(x.opp) ?? 'Lead', von: x.von!, nach: x.nach, datum: tag });
    if (x.von === 'setting_followup' || x.von === 'closing_followup') {
      if (FU_VORWAERTS.includes(x.nach)) p(x.user_id).fuVorwaerts++;
      else if (x.nach === 'lost') p(x.user_id).fuVerloren++;
    }
  }

  // Close-Aufgaben je Person
  for (const a of e.aufgaben) {
    const per = p(a.assigned_to);
    per.aufgabenOffen++;
    if (a.due_date && a.due_date.slice(0, 10) < heute) per.aufgabenUeberfaellig++;
  }
  for (const a of e.erledigteAufgaben ?? []) {
    if (a.due_date && tagDrin(a.due_date.slice(0, 10))) p(a.assigned_to).aufgabenErledigt++;
  }

  const liste = [...personen.values()];
  const proTag = (m: ProTag) => tage.map((t) => m[t] ?? 0);

  /* ── Tabellen ──────────────────────────────────────────────── */
  const anwahlenTabelle = liste
    .filter((x) => x.anwahlenGesamt > 0)
    .map((x) => ({
      name: name(x.id),
      anwahlen: proTag(x.anwahlen),
      gespraeche: proTag(x.gespraeche),
      summeAnwahlen: x.anwahlenGesamt,
      summeGespraeche: x.gespraecheGesamt,
      schnittAnwahlen: r1(x.anwahlenGesamt / werktageAnzahl),
    }))
    .sort((a, b) => b.summeAnwahlen - a.summeAnwahlen);

  const setter = liste
    .filter((x) => x.settingsGesamt > 0 || x.fuAnwahlenGesamt > 0)
    .map((x) => {
      const settings = proTag(x.settings);
      const fu = proTag(x.fuAnwahlen);
      const aktiveTage = tage.filter((t) => (x.settings[t] ?? 0) > 0 || (x.anwahlen[t] ?? 0) > 0);
      const schnittSettings = aktiveTage.length ? r1(aktiveTage.reduce((sum, t) => sum + (x.settings[t] ?? 0), 0) / aktiveTage.length) : null;
      const schnittFu = aktiveTage.length ? r1(aktiveTage.reduce((sum, t) => sum + (x.fuAnwahlen[t] ?? 0), 0) / aktiveTage.length) : null;
      return {
        name: name(x.id),
        settings,
        settingsAmpel: settings.map((n, i) => (aktiveTage.includes(tage[i]) || n > 0 ? ampelSetting(n, s) : 'leer' as Ampel)),
        followups: fu,
        followupsUnterMin: fu.map((n, i) => aktiveTage.includes(tage[i]) && n < s.followupsMin),
        summeSettings: x.settingsGesamt,
        summeFollowups: x.fuAnwahlenGesamt,
        aktiveTage: aktiveTage.length,
        schnittSettings,
        schnittFollowups: schnittFu,
        ampel: ampelSetting(schnittSettings, s),
        auslastungProzent: schnittSettings === null ? null : Math.round((schnittSettings / s.settingOptimal) * 100),
      };
    })
    .sort((a, b) => b.summeSettings - a.summeSettings);

  const closer = liste
    .filter((x) => x.closingsGesamt > 0)
    .map((x) => {
      const closings = proTag(x.closings);
      const aktiveTage = tage.filter((t) => (x.closings[t] ?? 0) > 0 || (x.anwahlen[t] ?? 0) > 0);
      const schnittClosings = aktiveTage.length ? r1(aktiveTage.reduce((sum, t) => sum + (x.closings[t] ?? 0), 0) / aktiveTage.length) : null;
      return {
        name: name(x.id),
        closings,
        closingsAmpel: closings.map((n, i) => (aktiveTage.includes(tage[i]) || n > 0 ? ampelClosing(n, s) : 'leer' as Ampel)),
        summeClosings: x.closingsGesamt,
        aktiveTage: aktiveTage.length,
        schnittClosings,
        ampel: ampelClosing(schnittClosings, s),
        auslastungProzent: schnittClosings === null ? null : Math.round((schnittClosings / ((s.closingMin + s.closingOptimal) / 2)) * 100),
      };
    })
    .sort((a, b) => b.summeClosings - a.summeClosings);

  const rueckholung = liste
    .filter((x) => x.rueckgeholt.length > 0 || x.noShowsGesetzt > 0)
    .map((x) => ({
      name: name(x.id),
      noShows: x.noShowsGesetzt,
      rueckgeholt: x.rueckgeholt.length,
      setting: x.rueckgeholt.filter((r) => r.von === 'setting_noshow').length,
      closing: x.rueckgeholt.filter((r) => r.von === 'closing_noshow').length,
      quote: quote(x.rueckgeholt.length, x.noShowsGesetzt),
      leads: x.rueckgeholt.sort((a, b) => b.datum.localeCompare(a.datum)),
    }))
    .sort((a, b) => b.rueckgeholt - a.rueckgeholt);

  const followups = liste
    .filter((x) => x.fuAnwahlenGesamt > 0 || x.fuVorwaerts > 0 || x.fuVerloren > 0 || x.aufgabenOffen > 0 || x.aufgabenErledigt > 0)
    .map((x) => ({
      name: name(x.id),
      anwahlen: x.fuAnwahlenGesamt,
      anwahlenProWerktag: r1(x.fuAnwahlenGesamt / werktageAnzahl),
      vorwaerts: x.fuVorwaerts,
      verloren: x.fuVerloren,
      quote: quote(x.fuVorwaerts, x.fuVorwaerts + x.fuVerloren),
      aufgabenOffen: x.aufgabenOffen,
      aufgabenUeberfaellig: x.aufgabenUeberfaellig,
      aufgabenErledigt: e.erledigteAufgaben === null ? null : x.aufgabenErledigt,
    }))
    .sort((a, b) => b.anwahlen - a.anwahlen);

  /* ── Kapazität: letzte 10 Werktage, unabhängig vom Zeitraum ── */
  const kTage = letzteWerktage(heute, 10);
  const kSet = new Set(kTage);
  const sJe = new Map<string, number>();
  const cJe = new Map<string, number>();
  let settingsGebucht = 0;
  let closingsGebucht = 0;
  for (const x of ü) {
    const tag = tagVon(x.date);
    if (!kSet.has(tag)) continue;
    if (SETTING_GEHALTEN(x)) sJe.set(key(x.user_id), (sJe.get(key(x.user_id)) ?? 0) + 1);
    if (CLOSING_GEHALTEN(x)) cJe.set(key(x.user_id), (cJe.get(key(x.user_id)) ?? 0) + 1);
    if (SETTING_GEBUCHT(x)) settingsGebucht++;
    if (CLOSING_GEBUCHT(x)) closingsGebucht++;
  }
  const anzahlSetter = sJe.size;
  const anzahlCloser = cJe.size;
  const settingsGehalten = [...sJe.values()].reduce((a, b) => a + b, 0);
  const closingsGehalten = [...cJe.values()].reduce((a, b) => a + b, 0);
  const schnittSetter = anzahlSetter ? r1(settingsGehalten / anzahlSetter / kTage.length) : null;
  const schnittCloser = anzahlCloser ? r1(closingsGehalten / anzahlCloser / kTage.length) : null;
  const closingZiel = (s.closingMin + s.closingOptimal) / 2;
  const settingVolumen = r1(settingsGebucht / kTage.length);
  const closingVolumen = r1(closingsGebucht / kTage.length);

  // Wochentrend der Termin-Eingänge (gebuchte Settings/Closings), letzte 8 Wochen
  const montag = (tag: string) => {
    const d = new Date(tag + 'T12:00:00Z');
    return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * TAG).toISOString().slice(0, 10);
  };
  const dieseWoche = montag(heute);
  const wochen = Array.from({ length: 8 }, (_, i) => ({
    woche: new Date(new Date(dieseWoche + 'T12:00:00Z').getTime() - (7 - i) * 7 * TAG).toISOString().slice(0, 10),
    settingsGebucht: 0,
    closingsGebucht: 0,
  }));
  for (const x of ü) {
    const w = wochen.find((wo) => wo.woche === montag(tagVon(x.date)));
    if (!w) continue;
    if (SETTING_GEBUCHT(x)) w.settingsGebucht++;
    if (CLOSING_GEBUCHT(x)) w.closingsGebucht++;
  }

  const setterNoetig = schnittSetter !== null && schnittSetter > s.settingVoll;
  const closerNoetig = schnittCloser !== null && schnittCloser > s.closingOptimal;
  const kapazitaet = {
    tage: kTage.length,
    setter: {
      anzahl: anzahlSetter,
      schnitt: schnittSetter,
      ampel: ampelSetting(schnittSetter, s),
      prozent: schnittSetter === null ? null : Math.round((schnittSetter / s.settingOptimal) * 100),
      volumenProTag: settingVolumen,
      optimalAnzahl: settingVolumen > 0 ? r1(settingVolumen / s.settingOptimal) : 0,
      neuNoetig: setterNoetig,
      aussage:
        schnittSetter === null
          ? 'Keine gehaltenen Settings in den letzten 10 Werktagen.'
          : setterNoetig
            ? `Setter-Team bei Ø ${schnittSetter} Settings/Tag (${Math.round((schnittSetter / s.settingOptimal) * 100)} %) – über ${s.settingVoll}: neuer Setter nötig.`
            : `Setter-Team bei Ø ${schnittSetter} Settings/Tag (${Math.round((schnittSetter / s.settingOptimal) * 100)} % vom Optimum ${s.settingOptimal}). Neuer Setter nötig, wenn Ø über 2 Wochen > ${s.settingVoll}.`,
    },
    closer: {
      anzahl: anzahlCloser,
      schnitt: schnittCloser,
      ampel: ampelClosing(schnittCloser, s),
      prozent: schnittCloser === null ? null : Math.round((schnittCloser / closingZiel) * 100),
      volumenProTag: closingVolumen,
      optimalAnzahl: closingVolumen > 0 ? r1(closingVolumen / closingZiel) : 0,
      neuNoetig: closerNoetig,
      aussage:
        schnittCloser === null
          ? 'Keine gehaltenen Closings in den letzten 10 Werktagen.'
          : closerNoetig
            ? `Closer bei Ø ${schnittCloser} Closings/Tag – über ${s.closingOptimal}: neuer Closer nötig.`
            : `Closer bei Ø ${schnittCloser} Closings/Tag (Ziel ${s.closingMin}–${s.closingOptimal}). Neuer Closer nötig, wenn Ø > ${s.closingOptimal}.`,
    },
    wochen,
  };

  return {
    schwellen: s,
    tage,
    tageGekuerzt: alleTage.length > tage.length,
    werktage: werktageAnzahl,
    anwahlenTabelle,
    setter,
    closer,
    rueckholung,
    followups,
    erledigteAufgabenGeladen: e.erledigteAufgaben !== null,
    kapazitaet,
  };
}

export type Auslastung = ReturnType<typeof berechneAuslastung>;
