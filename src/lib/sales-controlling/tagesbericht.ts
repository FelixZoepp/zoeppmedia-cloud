/**
 * Tagesbericht Vertrieb – ersetzt die Make-Szenarien, die bisher jeden Tag Zahlen aus Close nach Monday
 * geschrieben haben („Outbound Kaltakquise“, „Sales Pipeline Zahlen“, „Marketing“ im Workspace 10 - Kennzahlen).
 * Rein (keine I/O) – Eingaben kommen aus Close (Anrufe, Statuswechsel, Gesprächsprotokolle) und sales_eintragungen.
 *
 * Definitionen:
 * - Anwahlen: ausgehende Anrufe
 * - Gespräche: angenommene Anrufe ab 30 Sekunden (wie in der Telefonie-Auswertung)
 * - Entscheider gesprochen: Terminierungs-Protokolle mit „Wen erreicht = Lead“ oder Ergebnis + Follow-up-Protokolle mit Ergebnis außer „Nicht erreicht“
 * - Protokolle fehlen: Gespräch ohne Gesprächsprotokoll am selben Lead am selben Tag
 * - Settings/Closings gebucht, gehalten, No-Show, Abschlüsse: aus den Statuswechseln der Pipeline „D2D Sales“
 * - Unqualifiziert: Setting-Protokoll „Unqualifiziert“/„Disqualifiziert“
 */

import { berlinTag } from '@/lib/zeit/berlin';
import { istClosingGebucht, type CloseStatus, type Opp, type StatusEvent } from './compute';
import { CLOSING_GEHALTEN, SETTING_GEHALTEN } from './auslastung';
import { baueUebergaenge, istAusgehend, istGespraech, type Anruf } from './detail';

/** Close-Gesprächsprotokolle (Custom Activities) */
export const PROTOKOLL_TYPEN = {
  coldCall: 'actitype_1opHQI1ygoGZjsIG0z7SkR',
  setting: 'actitype_4VVTPxLTlLNPNsMsc7tgxC',
  closing: 'actitype_7QI2uISXKjTGXHK0AYmckm',
  followUp: 'actitype_3EqH37y6lgLrS9vufk3MU4',
} as const;

export const PROTOKOLL_FELDER = {
  entscheiderErgebnis: 'cf_0qd3PlDb9re1MU97cxNV7MJUXjHVYGmuifQc5CsTrN1',
  /** Terminierung: „📞 Wen erreicht?“ (Gatekeeper / Assistenz · Lead · Niemand / Mailbox) */
  wenErreicht: 'cf_U3JJwHBkSgOGtEKO4wd7b5EeLbUyv0uBXAQuG3GgEu6',
  settingNaechsterSchritt: 'cf_76Hh4UwJmO29mcOhNZdGglGCNpQyccCBbZSciCF3fb3',
  closingNaechsterSchritt: 'cf_BhCW7idf0P9fl8ba0D6OZJIwuUDqiiBhHwgJCJbScuJ',
  followUpNaechsterSchritt: 'cf_JKIoBAGq8wjSE0mo8C6lyWjMZHRw8WlwNJrqb0LpWeN',
} as const;

export interface Protokoll {
  typ: string;
  lead_id: string | null;
  user_id: string | null;
  date: string;
  /** Feld-ID (ohne „custom.“) → Wert */
  felder: Record<string, string | null>;
}

export interface Eintragung {
  eingetragen_am: string;
  ergebnis: string;
}

export interface TagesberichtEingaben {
  tage: string[];
  statuses: CloseStatus[];
  opps: Opp[];
  events: StatusEvent[];
  anrufe: Anruf[];
  protokolle: Protokoll[];
  eintragungen: Eintragung[];
  users: Map<string, string>;
}

export interface Tageszeile {
  tag: string;
  anwahlen: number;
  gespraeche: number;
  entscheider: number;
  protokolleFehlen: number;
  settingsGebucht: number;
  settingsGehalten: number;
  settingsNoShow: number;
  settingsUnqualifiziert: number;
  closingsGebucht: number;
  closingsGehalten: number;
  closingsNoShow: number;
  abschluesse: number;
  volumen: number;
  eintragungen: number;
  direktGebucht: number;
}

const LEER = (tag: string): Tageszeile => ({
  tag,
  anwahlen: 0,
  gespraeche: 0,
  entscheider: 0,
  protokolleFehlen: 0,
  settingsGebucht: 0,
  settingsGehalten: 0,
  settingsNoShow: 0,
  settingsUnqualifiziert: 0,
  closingsGebucht: 0,
  closingsGehalten: 0,
  closingsNoShow: 0,
  abschluesse: 0,
  volumen: 0,
  eintragungen: 0,
  direktGebucht: 0,
});

const tagVon = (iso: string) => berlinTag(new Date(iso));
const quote = (z: number, n: number) => (n > 0 ? Math.round((z / n) * 1000) / 10 : null);

export function istEntscheiderProtokoll(p: Protokoll): boolean {
  if (p.typ === PROTOKOLL_TYPEN.coldCall) return p.felder[PROTOKOLL_FELDER.wenErreicht] === 'Lead' || !!p.felder[PROTOKOLL_FELDER.entscheiderErgebnis];
  if (p.typ === PROTOKOLL_TYPEN.followUp) {
    const s = p.felder[PROTOKOLL_FELDER.followUpNaechsterSchritt];
    return !!s && !s.includes('Nicht erreicht');
  }
  return false;
}

export function istUnqualifiziert(p: Protokoll): boolean {
  if (p.typ !== PROTOKOLL_TYPEN.setting) return false;
  const s = p.felder[PROTOKOLL_FELDER.settingNaechsterSchritt] ?? '';
  return s.includes('Unqualifiziert') || s.includes('Disqualifiziert');
}

/** Kennzahlen + Quoten wie in den Monday-Dashboards (Formeln übernommen) */
export function quoten(z: Omit<Tageszeile, 'tag'>) {
  return {
    erreichbarkeit: quote(z.entscheider, z.anwahlen),
    terminierung: quote(z.settingsGebucht, z.entscheider),
    callToSetting: quote(z.settingsGebucht, z.anwahlen),
    showUpSetting: quote(z.settingsGehalten, z.settingsGehalten + z.settingsNoShow),
    qualifizierung: quote(z.closingsGebucht, z.settingsGehalten),
    showUpClosing: quote(z.closingsGehalten, z.closingsGehalten + z.closingsNoShow),
    closingRate: quote(z.abschluesse, z.closingsGehalten),
    direktQuote: quote(z.direktGebucht, z.eintragungen),
  };
}

export function berechneTagesbericht(e: TagesberichtEingaben) {
  const zeilen = new Map(e.tage.map((t) => [t, LEER(t)]));
  const zeile = (iso: string) => zeilen.get(tagVon(iso));

  // Telefonie
  for (const a of e.anrufe) {
    const z = zeile(a.date);
    if (!z) continue;
    if (istAusgehend(a)) z.anwahlen++;
    if (istGespraech(a)) z.gespraeche++;
  }

  // Protokolle: Entscheider, Unqualifiziert, und welche Leads am Tag protokolliert wurden
  const protokolliert = new Set<string>();
  for (const p of e.protokolle) {
    if (p.lead_id) protokolliert.add(`${p.lead_id}|${tagVon(p.date)}`);
    const z = zeile(p.date);
    if (!z) continue;
    if (istEntscheiderProtokoll(p)) z.entscheider++;
    if (istUnqualifiziert(p)) z.settingsUnqualifiziert++;
  }

  // Fehlende Protokolle: je Lead und Tag höchstens einmal zählen
  const fehlend = new Map<string, { tag: string; user_id: string | null }>();
  for (const a of e.anrufe) {
    if (!istGespraech(a) || !a.lead_id) continue;
    const tag = tagVon(a.date);
    if (!zeilen.has(tag)) continue;
    const key = `${a.lead_id}|${tag}`;
    if (!protokolliert.has(key) && !fehlend.has(key)) fehlend.set(key, { tag, user_id: a.user_id });
  }
  const fehlendJePerson = new Map<string, number>();
  for (const f of fehlend.values()) {
    zeilen.get(f.tag)!.protokolleFehlen++;
    const name = f.user_id ? e.users.get(f.user_id) ?? 'Unbekannt' : 'Ohne Zuordnung';
    fehlendJePerson.set(name, (fehlendJePerson.get(name) ?? 0) + 1);
  }

  // Pipeline aus den Statuswechseln
  const { ü } = baueUebergaenge(e.statuses, e.opps, e.events);
  for (const x of ü) {
    const z = zeile(x.date);
    if (!z) continue;
    if (x.nach === 'setting' && x.von !== 'setting') z.settingsGebucht++;
    if (SETTING_GEHALTEN(x)) z.settingsGehalten++;
    if (x.von === 'setting' && x.nach === 'setting_noshow') z.settingsNoShow++;
    if (istClosingGebucht(x)) z.closingsGebucht++;
    if (CLOSING_GEHALTEN(x)) z.closingsGehalten++;
    if ((x.von === 'closing' || x.von === 'cc2') && x.nach === 'closing_noshow') z.closingsNoShow++;
  }

  // Abschlüsse: Deals im Status „gewonnen“, gezählt am Abschlussdatum (sonst am Tag des Statuswechsels)
  const gewonnen = new Set(e.statuses.filter((s) => s.type === 'won').map((s) => s.id));
  const wonWechsel = new Map<string, string>();
  for (const x of ü) if (x.nach === 'won' && !wonWechsel.has(x.opp)) wonWechsel.set(x.opp, x.date);
  for (const o of e.opps) {
    if (!gewonnen.has(o.status_id)) continue;
    const tag = o.date_won ? o.date_won.slice(0, 10) : wonWechsel.has(o.id) ? tagVon(wonWechsel.get(o.id)!) : null;
    const z = tag ? zeilen.get(tag) : undefined;
    if (!z) continue;
    z.abschluesse++;
    z.volumen += o.value;
  }

  // Marketing: Eintragungen (Funnel-Leads in Close)
  for (const r of e.eintragungen) {
    if (r.ergebnis === 'manuell') continue;
    const z = zeile(r.eingetragen_am);
    if (!z) continue;
    z.eintragungen++;
    if (r.ergebnis === 'direkt_gebucht') z.direktGebucht++;
  }

  const liste = [...zeilen.values()].sort((a, b) => b.tag.localeCompare(a.tag));
  const summe = liste.reduce(
    (s, z) => {
      for (const k of Object.keys(s) as Array<keyof typeof s>) s[k] += z[k];
      return s;
    },
    (() => {
      const { tag, ...rest } = LEER('');
      void tag;
      return rest;
    })(),
  );
  return {
    tage: liste.map((z) => ({ ...z, quoten: quoten(z) })),
    summe: { ...summe, quoten: quoten(summe) },
    fehlendeProtokolleJePerson: [...fehlendJePerson].map(([name, anzahl]) => ({ name, anzahl })).sort((a, b) => b.anzahl - a.anzahl),
  };
}

export type Tagesbericht = ReturnType<typeof berechneTagesbericht>;
