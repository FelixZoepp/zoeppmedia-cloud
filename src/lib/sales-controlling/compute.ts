/**
 * Sales-Controlling: rechnet aus Close-Opportunities + Statuswechseln und Meta-Spend alle Kennzahlen.
 * Rein (keine I/O) – damit testbar. Umsatz = Auftragsvolumen = Wert neu gewonnener Deals.
 */

export type Stufe =
  | 'setting'
  | 'setting_noshow'
  | 'setting_followup'
  | 'closing'
  | 'closing_noshow'
  | 'closing_followup'
  | 'angebot'
  | 'cc2'
  | 'won'
  | 'lost'
  | 'andere';

export interface CloseStatus {
  id: string;
  label: string;
  type: string;
}

export interface Opp {
  id: string;
  lead_id: string;
  status_id: string;
  /** in Euro */
  value: number;
  date_created: string;
  date_won: string | null;
  user_id: string | null;
}

export interface StatusEvent {
  opportunity_id: string;
  old_status_id: string | null;
  new_status_id: string;
  date: string;
  user_id: string | null;
}

export interface MetaZahlen {
  spend: number;
  leads: number;
}

export interface Eingaben {
  statuses: CloseStatus[];
  opps: Opp[];
  events: StatusEvent[];
  /** lead_id → Quelle (Leadquelle/utm_source), null wenn leer */
  leadQuellen: Map<string, string | null>;
  users: Map<string, string>;
  metaZeitraum: MetaZahlen | null;
  metaVergleich: MetaZahlen | null;
  /** YYYY-MM → Spend/Leads */
  metaMonate: Map<string, MetaZahlen>;
  zeitraum: { von: string; bis: string; label: string };
  jetzt: Date;
  ziel: number;
}

/** Statuslabel (Close-Pipeline „D2D Sales“) → Stufe */
export function klassifiziere(s: CloseStatus | undefined): Stufe {
  if (!s) return 'andere';
  if (s.type === 'won') return 'won';
  if (s.type === 'lost') return 'lost';
  const l = s.label.toLowerCase();
  if (l.includes('angebot')) return 'angebot';
  if (l.includes('cc2')) return 'cc2';
  const closing = l.includes('closing');
  const setting = l.includes('setting');
  if (closing || setting) {
    const pre = closing ? 'closing' : 'setting';
    if (l.includes('no show') || l.includes('no-show') || l.includes('noshow')) return `${pre}_noshow` as Stufe;
    if (l.includes('follow')) return `${pre}_followup` as Stufe;
    return pre;
  }
  return 'andere';
}

const SETTING_GEHALTEN_NACH: Stufe[] = ['setting_followup', 'closing', 'closing_noshow', 'closing_followup', 'angebot', 'cc2', 'won', 'lost'];
const CLOSING_GEHALTEN_NACH: Stufe[] = ['closing_followup', 'angebot', 'won', 'lost'];

/**
 * Einheitliche Closing-Definition (auch für detail.ts): CC2 ist der Folgetermin eines bereits
 * gehaltenen Closings – zählt also weder als neu gebuchtes noch als zweites gehaltenes Closing.
 */
export const istClosingGebucht = (x: { von: Stufe | null; nach: Stufe }) => x.nach === 'closing' && x.von !== 'closing';
export const istClosingGehalten = (x: { von: Stufe | null; nach: Stufe }) =>
  x.von === 'closing' && (CLOSING_GEHALTEN_NACH.includes(x.nach) || x.nach === 'cc2');
const OFFEN: Stufe[] = ['setting', 'setting_noshow', 'setting_followup', 'closing', 'closing_noshow', 'closing_followup', 'angebot', 'cc2'];
const ABSCHLUSSNAH: Stufe[] = ['closing', 'cc2', 'angebot', 'closing_followup'];

/** Standard-Abschlusswahrscheinlichkeit je Stufe, solange zu wenig Historie vorliegt */
export const STANDARD_WAHRSCHEINLICHKEIT: Record<Stufe, number> = {
  setting: 0.15,
  setting_noshow: 0.06,
  setting_followup: 0.1,
  closing: 0.35,
  closing_noshow: 0.12,
  closing_followup: 0.25,
  angebot: 0.5,
  cc2: 0.45,
  won: 1,
  lost: 0,
  andere: 0.05,
};

export const STUFEN_LABEL: Record<Stufe, string> = {
  setting: 'Setting terminiert',
  setting_noshow: 'Setting No-Show',
  setting_followup: 'Setting Follow-up',
  closing: 'Closing terminiert',
  closing_noshow: 'Closing No-Show',
  closing_followup: 'Closing Follow-up',
  angebot: 'Angebot verschickt',
  cc2: 'CC2 terminiert',
  won: 'Gewonnen',
  lost: 'Verloren',
  andere: 'Sonstiges',
};

const TAG = 864e5;
const r1 = (n: number) => Math.round(n * 10) / 10;
const quote = (zaehler: number, nenner: number) => (nenner > 0 ? r1((zaehler / nenner) * 100) : null);

interface Übergang {
  opp: string;
  von: Stufe | null;
  nach: Stufe;
  date: string;
  user_id: string | null;
}

/** Alle Übergänge inkl. Anlage (Anfangsstatus) chronologisch */
function baueÜbergänge(e: Eingaben, stufeVon: (id: string | null) => Stufe | null): Übergang[] {
  const evByOpp = new Map<string, StatusEvent[]>();
  for (const ev of e.events) evByOpp.set(ev.opportunity_id, [...(evByOpp.get(ev.opportunity_id) ?? []), ev]);
  const out: Übergang[] = [];
  for (const o of e.opps) {
    const evs = (evByOpp.get(o.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const start = evs[0]?.old_status_id ?? o.status_id;
    out.push({ opp: o.id, von: null, nach: stufeVon(start) ?? 'andere', date: o.date_created, user_id: o.user_id });
    for (const ev of evs) out.push({ opp: o.id, von: stufeVon(ev.old_status_id), nach: stufeVon(ev.new_status_id) ?? 'andere', date: ev.date, user_id: ev.user_id });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface Periodenzahlen {
  neueAnfragen: number;
  settingGebucht: number;
  settingNoShow: number;
  settingGehalten: number;
  settingShowQuote: number | null;
  closingGebucht: number;
  closingNoShow: number;
  closingGehalten: number;
  closingShowQuote: number | null;
  angebote: number;
  gewonnen: number;
  verloren: number;
  auftragsvolumen: number;
  schnittDeal: number | null;
  leadZuSetting: number | null;
  settingZuClosing: number | null;
  closingZuAbschluss: number | null;
  zyklusTage: number | null;
  gewonneneDeals: Array<{ opp: string; lead_id: string; wert: number; datum: string; user_id: string | null }>;
}

function periodenzahlen(e: Eingaben, ü: Übergang[], von: string, bis: string): Periodenzahlen {
  const drin = (d: string) => d >= von && d < bis;
  const p = ü.filter((x) => drin(x.date));
  const opps = new Map(e.opps.map((o) => [o.id, o]));

  const neueAnfragen = e.opps.filter((o) => drin(o.date_created)).length;
  const settingGebucht = p.filter((x) => x.nach === 'setting' && x.von !== 'setting').length;
  const settingNoShow = p.filter((x) => x.nach === 'setting_noshow' && x.von !== 'setting_noshow').length;
  const settingGehalten = p.filter((x) => x.von === 'setting' && SETTING_GEHALTEN_NACH.includes(x.nach)).length;
  const closingGebucht = p.filter(istClosingGebucht).length;
  const closingNoShow = p.filter((x) => x.nach === 'closing_noshow' && x.von !== 'closing_noshow').length;
  const closingGehalten = p.filter(istClosingGehalten).length;
  const angebote = p.filter((x) => x.nach === 'angebot' && x.von !== 'angebot').length;
  const verloren = new Set(p.filter((x) => x.nach === 'lost').map((x) => x.opp)).size;

  // Gewonnen: maßgeblich ist das Abschlussdatum des Deals (date_won = „Close date“ in Close).
  // Der Statuswechsel taugt dafür nicht – alte Deals wurden z. B. gesammelt nachgetragen und hätten sonst
  // alle das Datum des Nachtragens. Nur ohne date_won zählt der erste Won-Statuswechsel.
  const wonEvent = new Map<string, Übergang>();
  for (const x of ü) if (x.nach === 'won' && !wonEvent.has(x.opp)) wonEvent.set(x.opp, x);
  const won = new Map<string, Übergang>();
  for (const o of e.opps) {
    if (klassifiziere(e.statuses.find((s) => s.id === o.status_id)) !== 'won') continue;
    const ev = wonEvent.get(o.id);
    const datum = o.date_won ?? ev?.date ?? null;
    if (datum && drin(datum)) won.set(o.id, { opp: o.id, von: null, nach: 'won', date: datum, user_id: ev?.user_id ?? o.user_id });
  }
  const gewonneneDeals = [...won.values()].map((x) => {
    const o = opps.get(x.opp)!;
    return { opp: o.id, lead_id: o.lead_id, wert: o.value, datum: x.date, user_id: x.user_id ?? o.user_id };
  });
  const auftragsvolumen = gewonneneDeals.reduce((s, d) => s + d.wert, 0);
  const zyklen = gewonneneDeals
    .map((d) => (new Date(d.datum).getTime() - new Date(opps.get(d.opp)!.date_created).getTime()) / TAG)
    .filter((t) => t >= 0);

  return {
    neueAnfragen,
    settingGebucht,
    settingNoShow,
    settingGehalten,
    settingShowQuote: quote(settingGehalten, settingGehalten + settingNoShow),
    closingGebucht,
    closingNoShow,
    closingGehalten,
    closingShowQuote: quote(closingGehalten, closingGehalten + closingNoShow),
    angebote,
    gewonnen: gewonneneDeals.length,
    verloren,
    auftragsvolumen,
    schnittDeal: gewonneneDeals.length ? Math.round(auftragsvolumen / gewonneneDeals.length) : null,
    leadZuSetting: quote(settingGebucht, neueAnfragen),
    settingZuClosing: quote(closingGebucht, settingGehalten),
    closingZuAbschluss: quote(gewonneneDeals.length, closingGehalten),
    zyklusTage: zyklen.length ? Math.round(zyklen.reduce((a, b) => a + b, 0) / zyklen.length) : null,
    gewonneneDeals,
  };
}

const isoTag = (d: Date) => d.toISOString().slice(0, 10);
const monatsStart = (d: Date, delta = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));

export interface Problem {
  stufe: 'kritisch' | 'wichtig' | 'hinweis';
  bereich: 'Marketing' | 'Setting' | 'Closing' | 'Pipeline' | 'Daten';
  titel: string;
  detail: string;
}

export function berechneSalesControlling(e: Eingaben) {
  const statusById = new Map(e.statuses.map((s) => [s.id, s]));
  const stufeVon = (id: string | null) => (id ? klassifiziere(statusById.get(id)) : null);
  const ü = baueÜbergänge(e, stufeVon);
  const jetzt = e.jetzt;
  const heute = isoTag(jetzt);
  const morgen = isoTag(new Date(jetzt.getTime() + TAG));

  // ── Zeitraum + Vergleich (gleich lange Vorperiode) ──
  const z = periodenzahlen(e, ü, e.zeitraum.von, e.zeitraum.bis);
  const länge = new Date(e.zeitraum.bis).getTime() - new Date(e.zeitraum.von).getTime();
  const vgVon = isoTag(new Date(new Date(e.zeitraum.von).getTime() - länge));
  const vg = periodenzahlen(e, ü, vgVon, e.zeitraum.von);

  // ── Referenzquoten: letzte 90 Tage (für Rückwärtsrechnung) ──
  const ref = periodenzahlen(e, ü, isoTag(new Date(jetzt.getTime() - 90 * TAG)), morgen);
  const refSpend = [...e.metaMonate.entries()]
    .filter(([m]) => m >= isoTag(monatsStart(jetzt, -2)).slice(0, 7))
    .reduce((s, [, v]) => s + v.spend, 0);

  // ── Marketing ──
  const spend = e.metaZeitraum?.spend ?? 0;
  const metaLeads = e.metaZeitraum?.leads ?? 0;
  const div = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : null);
  const quellen = new Map<string, number>();
  const neuImZeitraum = e.opps.filter((o) => o.date_created >= e.zeitraum.von && o.date_created < e.zeitraum.bis);
  const kategorie = (q: string | null | undefined) => {
    const s = (q ?? '').toLowerCase();
    if (!s) return 'Unbekannt';
    if (/(meta|facebook|instagram|fb|ig|paid)/.test(s)) return 'Meta Ads';
    if (/(empfehl|referral)/.test(s)) return 'Empfehlung';
    if (/(google|seo|organic|organisch|website)/.test(s)) return 'Organisch/Website';
    if (/(linkedin)/.test(s)) return 'LinkedIn';
    if (/(kalt|outbound|cold)/.test(s)) return 'Outbound';
    return 'Sonstige';
  };
  for (const o of neuImZeitraum) quellen.set(kategorie(e.leadQuellen.get(o.lead_id)), (quellen.get(kategorie(e.leadQuellen.get(o.lead_id))) ?? 0) + 1);
  const marketing = {
    spend,
    metaLeads,
    cpl: div(spend, metaLeads),
    neueAnfragen: z.neueAnfragen,
    kostenProAnfrage: div(spend, z.neueAnfragen),
    kostenProSetting: div(spend, z.settingGebucht),
    kostenProClosing: div(spend, z.closingGebucht),
    kundenakquisekosten: div(spend, z.gewonnen),
    roas: spend > 0 ? r1(z.auftragsvolumen / spend) : null,
    quellen: [...quellen.entries()].map(([quelle, anzahl]) => ({ quelle, anzahl })).sort((a, b) => b.anzahl - a.anzahl),
    vergleich: { spend: e.metaVergleich?.spend ?? 0, metaLeads: e.metaVergleich?.leads ?? 0, neueAnfragen: vg.neueAnfragen },
  };

  // ── Pipeline (aktueller Stand) ──
  const letzteBewegung = new Map<string, string>();
  for (const x of ü) letzteBewegung.set(x.opp, x.date);
  const historieStart = isoTag(new Date(jetzt.getTime() - 180 * TAG));
  const wahrscheinlichkeit = {} as Record<Stufe, number>;
  for (const st of Object.keys(STANDARD_WAHRSCHEINLICHKEIT) as Stufe[]) {
    const betroffen = new Set(ü.filter((x) => x.nach === st && x.date >= historieStart).map((x) => x.opp));
    let w = 0;
    let l = 0;
    for (const id of betroffen) {
      const o = e.opps.find((x) => x.id === id);
      const s = o ? stufeVon(o.status_id) : null;
      if (s === 'won') w++;
      else if (s === 'lost') l++;
    }
    wahrscheinlichkeit[st] = w + l >= 5 ? r1((w / (w + l)) * 100) / 100 : STANDARD_WAHRSCHEINLICHKEIT[st];
  }
  wahrscheinlichkeit.won = 1;
  wahrscheinlichkeit.lost = 0;

  const offen = e.opps.filter((o) => OFFEN.includes(stufeVon(o.status_id) ?? 'andere'));
  const proStufe = OFFEN.map((st) => {
    const list = offen.filter((o) => stufeVon(o.status_id) === st);
    const wert = list.reduce((s, o) => s + o.value, 0);
    const alt = list.filter((o) => (jetzt.getTime() - new Date(letzteBewegung.get(o.id) ?? o.date_created).getTime()) / TAG > 14);
    return {
      stufe: st,
      label: STUFEN_LABEL[st],
      anzahl: list.length,
      wert,
      gewichtet: Math.round(wert * wahrscheinlichkeit[st]),
      wahrscheinlichkeit: Math.round(wahrscheinlichkeit[st] * 100),
      ohneBewegung14Tage: alt.length,
    };
  });
  const pipeline = {
    offenAnzahl: offen.length,
    offenWert: offen.reduce((s, o) => s + o.value, 0),
    gewichtet: proStufe.reduce((s, x) => s + x.gewichtet, 0),
    abschlussnahGewichtet: proStufe.filter((x) => ABSCHLUSSNAH.includes(x.stufe)).reduce((s, x) => s + x.gewichtet, 0),
    proStufe,
    ohneWert: offen.filter((o) => !o.value).length,
  };

  // ── Ziel & Forecast (laufender Monat) ──
  const mStart = monatsStart(jetzt);
  const mEnde = monatsStart(jetzt, 1);
  const tageImMonat = Math.round((mEnde.getTime() - mStart.getTime()) / TAG);
  const vergangeneTage = Math.min(tageImMonat, Math.max(1, Math.ceil((jetzt.getTime() - mStart.getTime()) / TAG)));
  const monat = periodenzahlen(e, ü, isoTag(mStart), isoTag(mEnde));
  const sollBisHeute = Math.round((e.ziel * vergangeneTage) / tageImMonat);
  const hochrechnung = Math.round((monat.auftragsvolumen / vergangeneTage) * tageImMonat);
  const forecast = monat.auftragsvolumen + pipeline.abschlussnahGewichtet;
  const rest = Math.max(0, e.ziel - monat.auftragsvolumen);
  const restTage = Math.max(1, tageImMonat - vergangeneTage);
  const restWochen = Math.max(1 / 7, restTage / 7);

  // Rückwärtsrechnung mit 90-Tage-Quoten (Fallback: konservative Standardwerte)
  const q = (v: number | null, fallback: number) => (v && v > 0 ? Math.min(100, v) / 100 : fallback);
  const schnittDeal = ref.schnittDeal ?? 7190;
  const quoten = {
    closingZuAbschluss: q(ref.closingZuAbschluss, 0.35),
    closingShow: q(ref.closingShowQuote, 0.75),
    settingZuClosing: q(ref.settingZuClosing, 0.4),
    settingShow: q(ref.settingShowQuote, 0.7),
    anfrageZuSetting: q(ref.leadZuSetting, 0.5),
  };
  // Spend und Anfragen über dasselbe Fenster (Meta-Monate ab Vorvormonat)
  const spendFensterAb = isoTag(monatsStart(jetzt, -2));
  const refAnfragen = Math.max(1, e.opps.filter((o) => o.date_created >= spendFensterAb).length);
  const kostenProAnfrage = refSpend > 0 ? refSpend / refAnfragen : null;
  const rückwärts = (volumen: number) => {
    const deals = Math.ceil(volumen / schnittDeal);
    const closingsGehalten = Math.ceil(deals / quoten.closingZuAbschluss);
    const closingsGebucht = Math.ceil(closingsGehalten / quoten.closingShow);
    const settingsGehalten = Math.ceil(closingsGebucht / quoten.settingZuClosing);
    const settingsGebucht = Math.ceil(settingsGehalten / quoten.settingShow);
    const anfragen = Math.ceil(settingsGebucht / quoten.anfrageZuSetting);
    return {
      deals,
      closingsGehalten,
      closingsGebucht,
      settingsGehalten,
      settingsGebucht,
      anfragen,
      budget: kostenProAnfrage !== null ? Math.round(anfragen * kostenProAnfrage) : null,
    };
  };
  const tempo90ProWoche = {
    deals: r1(ref.gewonnen / (90 / 7)),
    closingsGebucht: r1(ref.closingGebucht / (90 / 7)),
    settingsGebucht: r1(ref.settingGebucht / (90 / 7)),
    anfragen: r1(ref.neueAnfragen / (90 / 7)),
    volumen: Math.round(ref.auftragsvolumen / (90 / 7)),
  };
  const restBedarf = rückwärts(rest);
  const ziel = {
    ziel: e.ziel,
    monat: isoTag(mStart).slice(0, 7),
    erreicht: monat.auftragsvolumen,
    deals: monat.gewonnen,
    prozent: r1((monat.auftragsvolumen / e.ziel) * 100),
    sollBisHeute,
    aufKurs: sollBisHeute > 0 ? r1((monat.auftragsvolumen / sollBisHeute) * 100) : null,
    hochrechnung,
    forecast,
    rest,
    vergangeneTage,
    tageImMonat,
    schnittDeal,
    quoten: Object.fromEntries(Object.entries(quoten).map(([k, v]) => [k, Math.round(v * 100)])) as Record<keyof typeof quoten, number>,
    kostenProAnfrage: kostenProAnfrage !== null ? Math.round(kostenProAnfrage) : null,
    bedarfRest: restBedarf,
    bedarfRestProWoche: Object.fromEntries(
      Object.entries(restBedarf).map(([k, v]) => [k, v === null ? null : Math.ceil((v as number) / restWochen)]),
    ) as Record<keyof typeof restBedarf, number | null>,
    bedarfVollerMonat: rückwärts(e.ziel),
    tempo90ProWoche,
    /** Wie viel % des nötigen Wochentempos aktuell erreicht wird (Deals) */
    tempoQuote: restBedarf.deals > 0 ? r1((tempo90ProWoche.deals / (restBedarf.deals / restWochen)) * 100) : 100,
  };

  // ── Verlauf: 6 Monate ──
  const verlauf = Array.from({ length: 6 }, (_, i) => {
    const s = monatsStart(jetzt, i - 5);
    const m = periodenzahlen(e, ü, isoTag(s), isoTag(monatsStart(jetzt, i - 4)));
    const key = isoTag(s).slice(0, 7);
    return {
      monat: key,
      auftragsvolumen: m.auftragsvolumen,
      deals: m.gewonnen,
      settingsGebucht: m.settingGebucht,
      closingsGebucht: m.closingGebucht,
      settingShowQuote: m.settingShowQuote,
      closingShowQuote: m.closingShowQuote,
      spend: e.metaMonate.get(key)?.spend ?? 0,
    };
  });

  // ── Personen (Setter/Closer – derzeit Deal-Besitzer in Close) ──
  const personen = new Map<string, { gewonnen: number; volumen: number; closingGehalten: number; closingNoShow: number; settingGehalten: number; settingNoShow: number }>();
  const pers = (id: string | null) => {
    const k = id ?? '–';
    if (!personen.has(k)) personen.set(k, { gewonnen: 0, volumen: 0, closingGehalten: 0, closingNoShow: 0, settingGehalten: 0, settingNoShow: 0 });
    return personen.get(k)!;
  };
  for (const d of z.gewonneneDeals) {
    const p = pers(d.user_id);
    p.gewonnen++;
    p.volumen += d.wert;
  }
  for (const x of ü.filter((x) => x.date >= e.zeitraum.von && x.date < e.zeitraum.bis)) {
    if (x.von === 'setting' && SETTING_GEHALTEN_NACH.includes(x.nach)) pers(x.user_id).settingGehalten++;
    if (x.nach === 'setting_noshow' && x.von !== 'setting_noshow') pers(x.user_id).settingNoShow++;
    if (istClosingGehalten(x)) pers(x.user_id).closingGehalten++;
    if (x.nach === 'closing_noshow' && x.von !== 'closing_noshow') pers(x.user_id).closingNoShow++;
  }
  const personenListe = [...personen.entries()]
    .map(([id, p]) => ({
      user_id: id === '–' ? null : id,
      name: id === '–' ? 'Nicht zugeordnet' : e.users.get(id) ?? 'Unbekannt',
      ...p,
      abschlussquote: quote(p.gewonnen, p.closingGehalten),
      closingShowQuote: quote(p.closingGehalten, p.closingGehalten + p.closingNoShow),
      settingShowQuote: quote(p.settingGehalten, p.settingGehalten + p.settingNoShow),
    }))
    .sort((a, b) => b.volumen - a.volumen);

  // ── Problemfelder ──
  const probleme: Problem[] = [];
  if (z.settingShowQuote !== null && z.settingShowQuote < 70) {
    probleme.push({
      stufe: z.settingShowQuote < 55 ? 'kritisch' : 'wichtig',
      bereich: 'Setting',
      titel: `Setting-Show-Quote nur ${z.settingShowQuote.toLocaleString('de-DE')} %`,
      detail: `${z.settingNoShow} No-Shows bei ${z.settingGehalten + z.settingNoShow} fälligen Terminen. Erinnerungen (WhatsApp 24 h/1 h), Bestätigung und Terminabstand prüfen.`,
    });
  }
  if (z.closingShowQuote !== null && z.closingShowQuote < 75) {
    probleme.push({
      stufe: z.closingShowQuote < 60 ? 'kritisch' : 'wichtig',
      bereich: 'Closing',
      titel: `Closing-Show-Quote nur ${z.closingShowQuote.toLocaleString('de-DE')} %`,
      detail: `${z.closingNoShow} Closing-No-Shows. Abstand Setting → Closing verkürzen, Vorab-Material schicken, Termin direkt im Setting bestätigen lassen.`,
    });
  }
  if (z.closingZuAbschluss !== null && z.closingGehalten >= 4 && z.closingZuAbschluss < 25) {
    probleme.push({
      stufe: 'wichtig',
      bereich: 'Closing',
      titel: `Abschlussquote im Closing nur ${z.closingZuAbschluss.toLocaleString('de-DE')} %`,
      detail: 'Qualifizierung im Setting schärfen (Budget, Entscheider, Zeitpunkt) und Einwände im Closing auswerten.',
    });
  }
  const staleFollow = proStufe.filter((x) => ['setting_followup', 'closing_followup', 'angebot'].includes(x.stufe)).reduce((s, x) => s + x.ohneBewegung14Tage, 0);
  if (staleFollow > 0) {
    const wert = offen
      .filter((o) => ['setting_followup', 'closing_followup', 'angebot'].includes(stufeVon(o.status_id) ?? '') && (jetzt.getTime() - new Date(letzteBewegung.get(o.id) ?? o.date_created).getTime()) / TAG > 14)
      .reduce((s, o) => s + o.value, 0);
    probleme.push({
      stufe: staleFollow >= 5 ? 'kritisch' : 'wichtig',
      bereich: 'Pipeline',
      titel: `${staleFollow} Deals seit über 14 Tagen ohne Bewegung`,
      detail: `Follow-ups und Angebote im Wert von ${Math.round(wert).toLocaleString('de-DE')} € liegen still. Nachfass-Rhythmus festlegen oder sauber auf „Verloren“ setzen.`,
    });
  }
  if (pipeline.gewichtet < rest && rest > 0) {
    probleme.push({
      stufe: 'kritisch',
      bereich: 'Pipeline',
      titel: 'Pipeline reicht nicht für das Monatsziel',
      detail: `Gewichtet liegen ${pipeline.gewichtet.toLocaleString('de-DE')} € in der Pipeline, bis zum Ziel fehlen ${rest.toLocaleString('de-DE')} €. Es braucht mehr Settings/Closings (siehe Rückwärtsrechnung).`,
    });
  }
  if (vg.neueAnfragen > 0 && z.neueAnfragen < vg.neueAnfragen * 0.7) {
    probleme.push({
      stufe: 'wichtig',
      bereich: 'Marketing',
      titel: `Anfragen gesunken: ${z.neueAnfragen} statt ${vg.neueAnfragen}`,
      detail: 'Weniger neue Opportunities als in der Vorperiode. Kampagnen, Budget und Creatives prüfen.',
    });
  }
  const unbekannt = quellen.get('Unbekannt') ?? 0;
  if (neuImZeitraum.length >= 3 && unbekannt / neuImZeitraum.length > 0.3) {
    probleme.push({
      stufe: 'hinweis',
      bereich: 'Daten',
      titel: `Quelle fehlt bei ${Math.round((unbekannt / neuImZeitraum.length) * 100)} % der Anfragen`,
      detail: 'Ohne Leadquelle/UTM lässt sich Marketing nicht sauber bewerten. Formulare und Close-Feld „Leadquelle“ prüfen.',
    });
  }
  if (pipeline.ohneWert > 0) {
    probleme.push({
      stufe: 'hinweis',
      bereich: 'Daten',
      titel: `${pipeline.ohneWert} offene Deals ohne Wert`,
      detail: 'Ohne Wert fehlen sie im Forecast. Paketwert in Close eintragen.',
    });
  }
  const zugeordnet = personenListe.filter((p) => p.user_id).length;
  if (zugeordnet <= 1) {
    probleme.push({
      stufe: 'hinweis',
      bereich: 'Daten',
      titel: 'Setter/Closer noch nicht getrennt',
      detail: 'Alle Deals hängen an einer Person. Sobald Setter und Closer als Close-Nutzer arbeiten, erscheint hier der Vergleich je Person.',
    });
  }
  const rang = { kritisch: 0, wichtig: 1, hinweis: 2 };
  probleme.sort((a, b) => rang[a.stufe] - rang[b.stufe]);

  // Datenqualität: gewonnene Deals ohne Abschlussdatum werden am Statuswechsel gezählt (ungenauer)
  const wonOhneDatum = e.opps.filter((o) => klassifiziere(statusById.get(o.status_id)) === 'won' && !o.date_won).length;

  return {
    zeitraum: e.zeitraum,
    stand: jetzt.toISOString(),
    datenqualitaet: { wonOhneAbschlussdatum: wonOhneDatum, wonGesamt: e.opps.filter((o) => klassifiziere(statusById.get(o.status_id)) === 'won').length },
    ziel,
    zahlen: z,
    vergleich: vg,
    referenz90: { ...ref, gewonneneDeals: undefined },
    marketing,
    pipeline,
    verlauf,
    personen: personenListe,
    probleme,
    heute,
  };
}

export type SalesControlling = ReturnType<typeof berechneSalesControlling>;
