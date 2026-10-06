/**
 * Sales-Controlling im Detail: Telefonie (Anwahlen, Erreichbarkeit, beste Zeiten), Show-Quoten
 * je Stufe inkl. Wochentrend und No-Show-Rückholung, Follow-ups (Bestand, Ausgang, Aufgaben)
 * und Durchlaufzeiten. Rein (keine I/O) – damit testbar.
 */

import { klassifiziere, STUFEN_LABEL, type CloseStatus, type Opp, type StatusEvent, type Stufe } from './compute';

export interface Anruf {
  lead_id: string | null;
  user_id: string | null;
  direction: string | null;
  /** answered | no-answer | vm-left | vm-answer | busy | blocked | error … */
  disposition: string | null;
  status: string | null;
  /** Sekunden */
  duration: number | null;
  date: string;
}

export interface Aufgabe {
  lead_id: string | null;
  lead_name: string | null;
  assigned_to: string | null;
  due_date: string | null;
  text: string | null;
}

export interface DetailEingaben {
  statuses: CloseStatus[];
  opps: Opp[];
  events: StatusEvent[];
  anrufe: Anruf[];
  aufgaben: Aufgabe[];
  users: Map<string, string>;
  zeitraum: { von: string; bis: string };
  jetzt: Date;
}

/** Ab so vielen Sekunden zählt ein angenommener Anruf als echtes Gespräch */
export const GESPRAECH_AB_SEK = 30;
const TAG = 864e5;
const r1 = (n: number) => Math.round(n * 10) / 10;
const quote = (a: number, b: number) => (b > 0 ? r1((a / b) * 100) : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const schnitt = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const berlin = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23', weekday: 'short' });
function stundeUndTag(iso: string): { stunde: number; tag: string } {
  const teile = berlin.formatToParts(new Date(iso));
  return {
    stunde: Number(teile.find((t) => t.type === 'hour')?.value ?? 0),
    tag: (teile.find((t) => t.type === 'weekday')?.value ?? '').replace('.', ''),
  };
}

const istGespraech = (a: Anruf) => a.disposition === 'answered' && (a.duration ?? 0) >= GESPRAECH_AB_SEK;
const istMailbox = (a: Anruf) => (a.disposition ?? '').startsWith('vm');
const istAusgehend = (a: Anruf) => a.direction !== 'inbound';

/** Montag der Woche (UTC-Datum) als YYYY-MM-DD */
function wochenStart(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00Z');
  const tag = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - tag * TAG).toISOString().slice(0, 10);
}

function werktage(von: string, bis: string, jetzt: Date): number {
  const ende = Math.min(new Date(bis + 'T00:00:00Z').getTime(), jetzt.getTime());
  let n = 0;
  for (let t = new Date(von + 'T12:00:00Z').getTime(); t < ende; t += TAG) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return Math.max(1, n);
}

interface Übergang {
  opp: string;
  von: Stufe | null;
  nach: Stufe;
  date: string;
  user_id: string | null;
}

export function berechneDetails(e: DetailEingaben) {
  const statusById = new Map(e.statuses.map((s) => [s.id, s]));
  const stufe = (id: string | null) => (id ? klassifiziere(statusById.get(id)) : null);
  const drin = (d: string) => d >= e.zeitraum.von && d < e.zeitraum.bis;
  const heute = e.jetzt.toISOString().slice(0, 10);
  const name = (id: string | null) => (id ? e.users.get(id) ?? 'Unbekannt' : 'Ohne Zuordnung');

  // Übergänge je Deal
  const evByOpp = new Map<string, StatusEvent[]>();
  for (const ev of e.events) evByOpp.set(ev.opportunity_id, [...(evByOpp.get(ev.opportunity_id) ?? []), ev]);
  const ü: Übergang[] = [];
  // Anlage des Deals zählt als erster Übergang (z. B. direkt als „Setting terminiert“ angelegt)
  for (const o of e.opps) {
    const erste = (evByOpp.get(o.id) ?? []).sort((a, b) => a.date.localeCompare(b.date))[0];
    ü.push({ opp: o.id, von: null, nach: stufe(erste?.old_status_id ?? o.status_id) ?? 'andere', date: o.date_created, user_id: o.user_id });
  }
  for (const ev of e.events) ü.push({ opp: ev.opportunity_id, von: stufe(ev.old_status_id), nach: stufe(ev.new_status_id) ?? 'andere', date: ev.date, user_id: ev.user_id });
  ü.sort((a, b) => a.date.localeCompare(b.date));
  const imZeitraum = ü.filter((x) => drin(x.date));

  /* ── Telefonie ─────────────────────────────────────────────── */
  const aus = e.anrufe.filter(istAusgehend);
  const calls = aus.filter((a) => drin(a.date));
  const gespraeche = calls.filter(istGespraech);
  const kurz = calls.filter((a) => a.disposition === 'answered' && !istGespraech(a)).length;
  const mailbox = calls.filter(istMailbox).length;
  const sekunden = gespraeche.reduce((s, a) => s + (a.duration ?? 0), 0);

  // Anwahlen bis zum ersten Gespräch je Lead (nur Leads mit Gespräch im Zeitraum)
  const anwahlenBis: number[] = [];
  const nachLead = new Map<string, Anruf[]>();
  for (const a of aus) if (a.lead_id) nachLead.set(a.lead_id, [...(nachLead.get(a.lead_id) ?? []), a]);
  for (const liste of nachLead.values()) {
    const sortiert = [...liste].sort((a, b) => a.date.localeCompare(b.date));
    const i = sortiert.findIndex(istGespraech);
    if (i >= 0 && drin(sortiert[i].date)) anwahlenBis.push(i + 1);
  }

  // Speed-to-Lead: neue Deals im Zeitraum → erste Anwahl auf dem Lead danach
  const neueDeals = e.opps.filter((o) => drin(o.date_created));
  const speed: number[] = [];
  let ohneAnwahl = 0;
  for (const o of neueDeals) {
    const erste = (nachLead.get(o.lead_id) ?? []).filter((a) => a.date >= o.date_created).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (erste) speed.push((new Date(erste.date).getTime() - new Date(o.date_created).getTime()) / 60000);
    else ohneAnwahl++;
  }

  const stunden = Array.from({ length: 13 }, (_, i) => ({ stunde: i + 8, anwahlen: 0, gespraeche: 0, quote: null as number | null }));
  const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const wochentage = TAGE.map((tag) => ({ tag, anwahlen: 0, gespraeche: 0, quote: null as number | null }));
  for (const a of calls) {
    const { stunde, tag } = stundeUndTag(a.date);
    const s = stunden.find((x) => x.stunde === stunde);
    const w = wochentage.find((x) => x.tag === tag);
    for (const z of [s, w]) {
      if (!z) continue;
      z.anwahlen++;
      if (istGespraech(a)) z.gespraeche++;
    }
  }
  for (const z of [...stunden, ...wochentage]) z.quote = quote(z.gespraeche, z.anwahlen);
  const besteStunden = stunden
    .filter((s) => s.anwahlen >= 3 && s.quote !== null)
    .sort((a, b) => (b.quote ?? 0) - (a.quote ?? 0))
    .slice(0, 3)
    .map((s) => s.stunde);

  const personenTel = new Map<string, { name: string; anwahlen: number; gespraeche: number; sekunden: number; leads: Set<string> }>();
  for (const a of calls) {
    const k = a.user_id ?? 'ohne';
    const p = personenTel.get(k) ?? { name: name(a.user_id), anwahlen: 0, gespraeche: 0, sekunden: 0, leads: new Set<string>() };
    p.anwahlen++;
    if (a.lead_id) p.leads.add(a.lead_id);
    if (istGespraech(a)) {
      p.gespraeche++;
      p.sekunden += a.duration ?? 0;
    }
    personenTel.set(k, p);
  }

  const tage = werktage(e.zeitraum.von, e.zeitraum.bis, e.jetzt);
  const telefonie = {
    anwahlen: calls.length,
    leadsAngerufen: new Set(calls.map((a) => a.lead_id).filter(Boolean)).size,
    gespraeche: gespraeche.length,
    kurzgespraeche: kurz,
    mailbox,
    nichtErreicht: calls.length - gespraeche.length - kurz - mailbox,
    erreichbarkeit: quote(gespraeche.length, calls.length),
    gespraechsMinuten: Math.round(sekunden / 60),
    schnittGespraechMin: gespraeche.length ? r1(sekunden / gespraeche.length / 60) : null,
    anwahlenProWerktag: r1(calls.length / tage),
    gespraecheProWerktag: r1(gespraeche.length / tage),
    werktage: tage,
    anwahlenBisGespraech: anwahlenBis.length ? r1(schnitt(anwahlenBis)!) : null,
    speedToLeadMedianMin: speed.length ? Math.round(median(speed)!) : null,
    neueDeals: neueDeals.length,
    neueDealsOhneAnwahl: ohneAnwahl,
    stunden,
    wochentage: wochentage.slice(0, 5),
    besteStunden,
    personen: [...personenTel.values()]
      .map((p) => ({
        name: p.name,
        anwahlen: p.anwahlen,
        leads: p.leads.size,
        gespraeche: p.gespraeche,
        erreichbarkeit: quote(p.gespraeche, p.anwahlen),
        minuten: Math.round(p.sekunden / 60),
        proWerktag: r1(p.anwahlen / tage),
      }))
      .sort((a, b) => b.anwahlen - a.anwahlen),
  };

  /* ── Show-Quoten im Detail ─────────────────────────────────── */
  const zähle = (liste: Übergang[]) => {
    const settingGebucht = liste.filter((x) => x.nach === 'setting' && x.von !== 'setting').length;
    const settingNoShow = liste.filter((x) => x.nach === 'setting_noshow' && x.von !== 'setting_noshow').length;
    const settingGehalten = liste.filter((x) => x.von === 'setting' && !['setting', 'setting_noshow', 'andere'].includes(x.nach)).length;
    const closingGebucht = liste.filter((x) => x.nach === 'closing' && x.von !== 'closing').length;
    const closingNoShow = liste.filter((x) => x.nach === 'closing_noshow' && x.von !== 'closing_noshow').length;
    const closingGehalten = liste.filter((x) => x.von === 'closing' && ['closing_followup', 'angebot', 'cc2', 'won', 'lost'].includes(x.nach)).length;
    const cc2Gebucht = liste.filter((x) => x.nach === 'cc2' && x.von !== 'cc2').length;
    const cc2Gehalten = liste.filter((x) => x.von === 'cc2' && ['closing_followup', 'angebot', 'won', 'lost'].includes(x.nach)).length;
    // No-Show im CC2: zurück in No-Show oder Follow-up ohne Termin wird nicht als Show gewertet
    const cc2NoShow = liste.filter((x) => x.von === 'cc2' && x.nach === 'closing_noshow').length;
    return {
      setting: { gebucht: settingGebucht, gehalten: settingGehalten, noShow: settingNoShow, quote: quote(settingGehalten, settingGehalten + settingNoShow) },
      closing: { gebucht: closingGebucht, gehalten: closingGehalten, noShow: closingNoShow, quote: quote(closingGehalten, closingGehalten + closingNoShow) },
      cc2: { gebucht: cc2Gebucht, gehalten: cc2Gehalten, noShow: cc2NoShow, quote: quote(cc2Gehalten, cc2Gehalten + cc2NoShow) },
    };
  };

  // No-Show-Rückholung: No-Shows im Zeitraum → später wieder terminiert bzw. doch gehalten
  const rückholung = (von: Stufe, wieder: Stufe[]) => {
    const ns = imZeitraum.filter((x) => x.nach === von);
    const zurück = ns.filter((n) => ü.some((x) => x.opp === n.opp && x.date > n.date && x.von === von && wieder.includes(x.nach))).length;
    return { noShows: ns.length, wiederTerminiert: zurück, quote: quote(zurück, ns.length) };
  };

  // Wochentrend: letzte 8 Wochen
  const dieseWoche = wochenStart(e.jetzt.toISOString());
  const wochen = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(new Date(dieseWoche + 'T12:00:00Z').getTime() - (7 - i) * 7 * TAG).toISOString().slice(0, 10);
    const ende = new Date(new Date(start + 'T12:00:00Z').getTime() + 7 * TAG).toISOString().slice(0, 10);
    const z = zähle(ü.filter((x) => x.date >= start && x.date < ende));
    const anw = aus.filter((a) => a.date >= start && a.date < ende);
    return {
      woche: start,
      settingsGebucht: z.setting.gebucht,
      settingQuote: z.setting.quote,
      closingsGebucht: z.closing.gebucht + z.cc2.gebucht,
      closingQuote: z.closing.quote,
      anwahlen: anw.length,
      gespraeche: anw.filter(istGespraech).length,
    };
  });

  // Show-Quoten je Person (wer hat den Status gesetzt)
  const personenShow = new Map<string, Übergang[]>();
  for (const x of imZeitraum) personenShow.set(x.user_id ?? 'ohne', [...(personenShow.get(x.user_id ?? 'ohne') ?? []), x]);

  const shows = {
    ...zähle(imZeitraum),
    rückholungSetting: rückholung('setting_noshow', ['setting', 'setting_followup', 'closing', 'cc2']),
    rückholungClosing: rückholung('closing_noshow', ['closing', 'cc2', 'closing_followup', 'angebot']),
    wochen,
    personen: [...personenShow.entries()].map(([id, liste]) => {
      const z = zähle(liste);
      return { name: name(id === 'ohne' ? null : id), setting: z.setting, closing: z.closing };
    }),
  };

  /* ── Follow-ups ────────────────────────────────────────────── */
  const offen = e.opps.filter((o) => {
    const s = stufe(o.status_id);
    return s !== null && !['won', 'lost', 'andere'].includes(s);
  });
  const seit = (o: Opp) => {
    const letzte = (evByOpp.get(o.id) ?? []).map((x) => x.date).sort().pop() ?? o.date_created;
    return (e.jetzt.getTime() - new Date(letzte).getTime()) / TAG;
  };
  const fuStufen: Stufe[] = ['setting_followup', 'closing_followup', 'angebot', 'setting_noshow', 'closing_noshow'];
  const bestand = fuStufen.map((s) => {
    const liste = offen.filter((o) => stufe(o.status_id) === s);
    const tage = liste.map(seit);
    return {
      stufe: s,
      label: STUFEN_LABEL[s],
      anzahl: liste.length,
      wert: Math.round(liste.reduce((sum, o) => sum + o.value, 0)),
      schnittTage: tage.length ? Math.round(schnitt(tage)!) : null,
      aelter14: tage.filter((t) => t > 14).length,
      aelter30: tage.filter((t) => t > 30).length,
    };
  });

  // Ausgang der Follow-ups im Zeitraum
  const ausFu = imZeitraum.filter((x) => x.von === 'setting_followup' || x.von === 'closing_followup');
  const vorwärts = ausFu.filter((x) => ['closing', 'cc2', 'angebot', 'won'].includes(x.nach)).length;
  const verloren = ausFu.filter((x) => x.nach === 'lost').length;

  // Aufgaben (Close-Tasks) zu offenen Deals
  const offeneLeads = new Set(offen.map((o) => o.lead_id));
  const in7 = new Date(e.jetzt.getTime() + 7 * TAG).toISOString().slice(0, 10);
  const mitAufgabe = new Set(e.aufgaben.map((a) => a.lead_id).filter(Boolean));
  const überfällig = e.aufgaben.filter((a) => a.due_date && a.due_date.slice(0, 10) < heute);
  const followups = {
    bestand,
    offenGesamt: offen.length,
    ausgang: {
      gesamt: ausFu.length,
      vorwärts,
      verloren,
      quote: quote(vorwärts, ausFu.length),
    },
    aufgaben: {
      offen: e.aufgaben.length,
      ueberfaellig: überfällig.length,
      heute: e.aufgaben.filter((a) => a.due_date?.slice(0, 10) === heute).length,
      naechste7: e.aufgaben.filter((a) => a.due_date && a.due_date.slice(0, 10) > heute && a.due_date.slice(0, 10) <= in7).length,
      dealsOhneAufgabe: [...offeneLeads].filter((l) => !mitAufgabe.has(l)).length,
      ueberfaelligListe: überfällig
        .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
        .slice(0, 12)
        .map((a) => ({
          lead: a.lead_name ?? 'Lead',
          text: a.text ?? '',
          faellig: a.due_date!.slice(0, 10),
          tageUeber: Math.floor((new Date(heute).getTime() - new Date(a.due_date!.slice(0, 10)).getTime()) / TAG),
          person: name(a.assigned_to),
        })),
    },
  };

  /* ── Durchlaufzeiten (erste Erreichung je Deal) ────────────── */
  const ersteZeit = (opp: string, ziel: Stufe[]) => ü.find((x) => x.opp === opp && ziel.includes(x.nach))?.date ?? null;
  const dauer: Record<'anfrageSetting' | 'settingClosing' | 'closingAbschluss', number[]> = { anfrageSetting: [], settingClosing: [], closingAbschluss: [] };
  for (const o of e.opps) {
    const tSetting = stufe(o.status_id) === 'setting' && !evByOpp.has(o.id) ? o.date_created : ersteZeit(o.id, ['setting']) ?? o.date_created;
    const tClosing = ersteZeit(o.id, ['closing', 'cc2']);
    const tWon = o.date_won && stufe(o.status_id) === 'won' ? o.date_won : null;
    const d = (a: string | null, b: string | null) => (a && b ? (new Date(b).getTime() - new Date(a).getTime()) / TAG : null);
    const push = (k: keyof typeof dauer, v: number | null, ende: string | null) => {
      if (v !== null && v >= 0 && ende && drin(ende)) dauer[k].push(v);
    };
    push('anfrageSetting', d(o.date_created, ersteZeit(o.id, ['setting'])), ersteZeit(o.id, ['setting']));
    push('settingClosing', d(tSetting, tClosing), tClosing);
    push('closingAbschluss', d(tClosing, tWon), tWon);
  }
  const durchlauf = Object.fromEntries(
    Object.entries(dauer).map(([k, v]) => [k, { tage: v.length ? r1(median(v)!) : null, faelle: v.length }]),
  ) as Record<keyof typeof dauer, { tage: number | null; faelle: number }>;

  return { telefonie, shows, followups, durchlauf };
}

export type SalesDetails = ReturnType<typeof berechneDetails>;
