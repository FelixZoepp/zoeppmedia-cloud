/**
 * Kontrollzentrum: reine Rechen- und Bewertungsfunktionen (ohne Datenbank, testbar).
 * Kennzahlen je Kunde für ein Zeitfenster, Ampel mit Gründen, Upsell-Signal, Churn-Risiko und Marge.
 */

export type Ampel = 'gruen' | 'gelb' | 'rot';

/** Länge eines Auswertungsfensters in Tagen (Vergleich: die 30 Tage davor) */
export const FENSTER_TAGE = 30;
/** Churn: so viele Tage muss ein Kunde schon rot sein */
export const ROT_SEIT_TAGEN = 14;

/** Schwellen für Ampel, Upsell und Churn – bewusst an einer Stelle */
export const SCHWELLEN = {
  /** Ab so vielen neuen Leads wird die Kontaktquote bewertet */
  MIN_LEADS_QUOTE: 5,
  /** Kontaktquote unter … % → rot */
  KONTAKT_ROT: 50,
  /** Kontaktquote unter … % → gelb */
  KONTAKT_GELB: 80,
  /** Median Zeit bis Erstkontakt über … Stunden → gelb */
  ERSTKONTAKT_GELB_STD: 24,
  /** Mehr als … Leads, aber kein Termin → rot */
  LEADS_OHNE_TERMIN_ROT: 20,
  /** Erscheinensquote unter … % → gelb (ab MIN_TERMINE_ERSCHEINEN vergangenen Terminen) */
  ERSCHEINEN_GELB: 50,
  MIN_TERMINE_ERSCHEINEN: 3,
  /** Leads eingebrochen: weniger als Faktor × Vorperiode (ab MIN_LEADS_VORHER) */
  LEADS_EINBRUCH_FAKTOR: 0.5,
  MIN_LEADS_VORHER: 10,
  /** Upsell: so viele Einstellungen in 30 Tagen */
  UPSELL_EINSTELLUNGEN: 3,
  /** Upsell: Leads um mindestens … gestiegen (0,3 = +30 %) bei guter Kontaktquote */
  UPSELL_LEADS_PLUS: 0.3,
  UPSELL_MIN_LEADS: 10,
  UPSELL_KONTAKT: 80,
} as const;

/** Geschätzte Kommunikationskosten (Schätzung, ohne Indeed) */
export const KOSTEN = {
  ANRUF_MINUTE: 0.05,
  WHATSAPP_VORLAGE: 0.05,
} as const;

const TAG = 864e5;

export interface Fenster {
  von: string;
  bis: string;
}

/** Fenster von `startTage` bis `endeTage` Tage vor jetzt (z. B. 30 → 0) */
export function fenster(jetzt: Date, startTage: number, endeTage = 0): Fenster {
  return { von: new Date(jetzt.getTime() - startTage * TAG).toISOString(), bis: new Date(jetzt.getTime() - endeTage * TAG).toISOString() };
}

const drin = (iso: string | null | undefined, f: Fenster) => !!iso && iso >= f.von && iso < f.bis;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export function median(werte: number[]): number | null {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export interface KandidatRoh {
  id: string;
  created_at: string;
  first_contact_at: string | null;
  ttfc_seconds: number | null;
}

export interface TerminRoh {
  datum: string;
  status: string | null;
}

const ABGESAGT = ['abgesagt', 'cancelled'];
const ERSCHIENEN = ['erschienen', 'done', 'completed'];
const NO_SHOW = ['no_show'];

export interface Kennzahlen {
  leads: number;
  kontaktiert: number;
  kontaktquote: number | null;
  /** Median Sekunden bis zum Erstkontakt */
  ttfcMedianSek: number | null;
  termine: number;
  erschienen: number;
  noShows: number;
  erscheinensquote: number | null;
  einstellungen: number;
  anrufe: number;
}

/** Kennzahlen eines Kunden in einem Fenster. `angerufen`: Bewerber-IDs mit Anruf-Protokoll. */
export function kennzahlen(
  d: { kandidaten: KandidatRoh[]; angerufen: Set<string>; termine: TerminRoh[]; einstellungen: string[]; anrufe: string[] },
  f: Fenster,
): Kennzahlen {
  const neu = d.kandidaten.filter((k) => drin(k.created_at, f));
  const kontaktiert = neu.filter((k) => k.first_contact_at || d.angerufen.has(k.id)).length;
  const ttfc = neu.map((k) => k.ttfc_seconds).filter((s): s is number => typeof s === 'number' && s >= 0);
  const tm = d.termine.filter((t) => drin(t.datum, f) && !ABGESAGT.includes(t.status ?? ''));
  const erschienen = tm.filter((t) => ERSCHIENEN.includes(t.status ?? '')).length;
  const noShows = tm.filter((t) => NO_SHOW.includes(t.status ?? '')).length;
  return {
    leads: neu.length,
    kontaktiert,
    kontaktquote: pct(kontaktiert, neu.length),
    ttfcMedianSek: median(ttfc),
    termine: tm.length,
    erschienen,
    noShows,
    erscheinensquote: pct(erschienen, erschienen + noShows),
    einstellungen: d.einstellungen.filter((x) => drin(x, f)).length,
    anrufe: d.anrufe.filter((x) => drin(x, f)).length,
  };
}

/** Kein Kunden-Login im Fenster (users.last_login kennt nur den letzten Login; danach = „war da“) */
export function keinLogin(letzterLogin: string | null, f: Fenster): boolean {
  return !letzterLogin || letzterLogin < f.von;
}

export function leadsEingebrochen(jetzt: Kennzahlen, vorher: Kennzahlen): boolean {
  return vorher.leads >= SCHWELLEN.MIN_LEADS_VORHER && jetzt.leads < vorher.leads * SCHWELLEN.LEADS_EINBRUCH_FAKTOR;
}

/** Ampel mit Gründen in Klartext. `loginPruefen`: nur für Kunden, die die Cloud schon nutzen sollen. */
export function bewerteAmpel(
  k: Kennzahlen,
  vorher: Kennzahlen,
  ctx: { keineLogins: boolean; loginPruefen: boolean },
): { ampel: Ampel; gruende: string[] } {
  const gruende: string[] = [];
  let ampel: Ampel = 'gruen';
  const rot = (g: string) => ((ampel = 'rot'), gruende.push(g));
  const gelb = (g: string) => (ampel !== 'rot' && (ampel = 'gelb'), gruende.push(g));
  const S = SCHWELLEN;

  if (k.leads >= S.MIN_LEADS_QUOTE && k.kontaktquote !== null) {
    if (k.kontaktquote < S.KONTAKT_ROT) rot(`Nur ${k.kontaktquote} % der Leads kontaktiert`);
    else if (k.kontaktquote < S.KONTAKT_GELB) gelb(`${k.kontaktquote} % der Leads kontaktiert`);
  }
  if (ctx.loginPruefen && ctx.keineLogins) rot('Keine Kunden-Logins in 30 Tagen');
  if (k.leads > S.LEADS_OHNE_TERMIN_ROT && k.termine === 0) rot(`${k.leads} Leads, aber keine Termine`);
  if (k.ttfcMedianSek !== null && k.ttfcMedianSek > S.ERSTKONTAKT_GELB_STD * 3600) {
    gelb(`Erstkontakt dauert im Median ${Math.round(k.ttfcMedianSek / 3600)} Std.`);
  }
  if (k.erschienen + k.noShows >= S.MIN_TERMINE_ERSCHEINEN && k.erscheinensquote !== null && k.erscheinensquote < S.ERSCHEINEN_GELB) {
    gelb(`Nur ${k.erscheinensquote} % zu Terminen erschienen`);
  }
  if (leadsEingebrochen(k, vorher)) gelb(`Leads eingebrochen: ${k.leads} statt ${vorher.leads}`);
  return { ampel, gruende };
}

export function churnRisiko(ctx: {
  ampel: Ampel;
  /** Ampel für das Fenster, das ROT_SEIT_TAGEN früher endete */
  ampelFrueher: Ampel;
  keineLogins: boolean;
  loginPruefen: boolean;
  jetzt: Kennzahlen;
  vorher: Kennzahlen;
}): { risiko: boolean; gruende: string[] } {
  const gruende: string[] = [];
  if (ctx.ampel === 'rot' && ctx.ampelFrueher === 'rot') gruende.push(`Seit mindestens ${ROT_SEIT_TAGEN} Tagen rot`);
  if (ctx.loginPruefen && ctx.keineLogins) gruende.push('Kunde loggt sich nicht ein');
  if (leadsEingebrochen(ctx.jetzt, ctx.vorher)) gruende.push(`Leads eingebrochen (${ctx.jetzt.leads} statt ${ctx.vorher.leads})`);
  return { risiko: gruende.length > 0, gruende };
}

export function upsellSignal(ctx: {
  ampel: Ampel;
  jetzt: Kennzahlen;
  vorher: Kennzahlen;
  garantieErreicht: boolean;
  mitInnendienst: boolean;
}): { signal: boolean; gruende: string[]; vorschlaege: string[] } {
  const S = SCHWELLEN;
  const gruende: string[] = [];
  const vorschlaege = new Set<string>();
  if (ctx.ampel === 'rot') return { signal: false, gruende, vorschlaege: [] };
  const { jetzt: k, vorher } = ctx;

  if (ctx.garantieErreicht || k.einstellungen >= S.UPSELL_EINSTELLUNGEN) {
    gruende.push(ctx.garantieErreicht ? 'Garantie-Ziel erreicht' : `${k.einstellungen} Einstellungen in 30 Tagen`);
    vorschlaege.add('Masterclass Führungskräfte');
    vorschlaege.add('Weitere Stellen/Standorte');
  }
  const gestiegen = vorher.leads > 0 && k.leads >= S.UPSELL_MIN_LEADS && k.leads >= vorher.leads * (1 + S.UPSELL_LEADS_PLUS);
  if (gestiegen && (k.kontaktquote ?? 0) >= S.UPSELL_KONTAKT) {
    gruende.push(`Leads +${Math.round(((k.leads - vorher.leads) / vorher.leads) * 100)} % bei ${k.kontaktquote} % Kontaktquote`);
    vorschlaege.add('Mehr Budget');
    vorschlaege.add('Weitere Stellen/Standorte');
  }
  if (gruende.length && !ctx.mitInnendienst) vorschlaege.add('Innendienst');
  return { signal: gruende.length > 0, gruende, vorschlaege: [...vorschlaege] };
}

export interface Marge {
  umsatz: number | null;
  /** null = keine Zeiterfassung oder kein Stundensatz */
  teamKosten: number | null;
  teamStunden: number | null;
  /** Schätzung aus Anrufminuten und WhatsApp-Vorlagen */
  kommKosten: number;
  marge: number | null;
  margeProzent: number | null;
}

/** Marge = Umsatz (MRR) − Teamkosten − geschätzte Kommunikationskosten. Indeed wird nicht abgezogen. */
export function berechneMarge(d: {
  umsatz: number | null;
  teamMinuten: number | null;
  stundensatz: number | null;
  anrufMinuten: number;
  vorlagen: number;
}): Marge {
  const teamStunden = d.teamMinuten === null ? null : Math.round((d.teamMinuten / 60) * 10) / 10;
  const teamKosten = d.teamMinuten === null || d.stundensatz === null ? null : Math.round((d.teamMinuten / 60) * d.stundensatz * 100) / 100;
  const kommKosten = Math.round((d.anrufMinuten * KOSTEN.ANRUF_MINUTE + d.vorlagen * KOSTEN.WHATSAPP_VORLAGE) * 100) / 100;
  const marge = d.umsatz === null ? null : Math.round((d.umsatz - (teamKosten ?? 0) - kommKosten) * 100) / 100;
  return {
    umsatz: d.umsatz,
    teamKosten,
    teamStunden,
    kommKosten,
    marge,
    margeProzent: marge !== null && d.umsatz ? Math.round((marge / d.umsatz) * 100) : null,
  };
}

/** Kosten pro Einstellung für den Kunden: (MRR + Werbebudget) / Einstellungen – ohne Indeed */
export function kostenProEinstellung(mrr: number | null, werbebudget: number | null, einstellungen: number): number | null {
  const kosten = (mrr ?? 0) + (werbebudget ?? 0);
  if (!einstellungen || kosten <= 0) return null;
  return Math.round(kosten / einstellungen);
}

/** system_einstellungen.bewerber_kontakt = { aktiv, kunden?: string[] } – ohne Kundenliste gilt der Schalter für alle */
export function bewerberKontaktAktiv(wert: unknown, agencyId: string): boolean {
  let w = wert;
  if (typeof w === 'string') {
    try {
      w = JSON.parse(w);
    } catch {
      return false;
    }
  }
  const o = (w ?? {}) as { aktiv?: unknown; kunden?: unknown };
  if (o.aktiv !== true) return false;
  return !Array.isArray(o.kunden) || !o.kunden.length || o.kunden.includes(agencyId);
}

/** Zahl aus system_einstellungen tolerant lesen ("65", "65,5", 65, {"wert": 65}) */
export function liesZahl(wert: unknown): number | null {
  let w = wert;
  if (typeof w === 'string') {
    try {
      w = JSON.parse(w);
    } catch {
      /* Klartext */
    }
  }
  if (w && typeof w === 'object') {
    const o = w as Record<string, unknown>;
    w = o.wert ?? o.stundensatz ?? o.betrag ?? null;
  }
  const n = typeof w === 'number' ? w : typeof w === 'string' ? Number(w.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Zeitpunkt der Einstellung je Bewerber: eingestellt_am, sonst letzter Wechsel in eine Einstellungs-Stufe, sonst Anlage */
export function einstellungsZeitpunkte(
  kandidaten: Array<{ id: string; agency_id: string; eingestellt_am: string | null; current_stage_id: string | null; created_at: string }>,
  wechsel: Array<{ candidate_id: string; changed_at: string }>,
  hired: Set<string>,
): Array<{ agency_id: string; datum: string }> {
  const letzter = new Map<string, string>();
  for (const w of wechsel) if (!letzter.has(w.candidate_id) || w.changed_at > letzter.get(w.candidate_id)!) letzter.set(w.candidate_id, w.changed_at);
  const out: Array<{ agency_id: string; datum: string }> = [];
  for (const k of kandidaten) {
    const datum = k.eingestellt_am ?? letzter.get(k.id) ?? (k.current_stage_id && hired.has(k.current_stage_id) ? k.created_at : null);
    if (datum) out.push({ agency_id: k.agency_id, datum });
  }
  return out;
}

export interface WarnZeile {
  id: string;
  name: string;
  csm_user_id: string | null;
  pausiert: boolean;
  ampel: Ampel;
  gruende: string[];
  churn: { risiko: boolean; gruende: string[] };
}

export interface WarnAufgabe {
  agency_id: string;
  grund: 'rot' | 'churn';
  title: string;
  description: string;
  assigned_to: string | null;
  quelle_ref: string;
}

/** Frühwarnung: je Kunde und Grund höchstens eine offene Aufgabe (offeneRefs = quelle_ref offener Aufgaben) */
export function warnAufgaben(zeilen: WarnZeile[], offeneRefs: string[], heute: string): WarnAufgabe[] {
  const offen = (id: string, grund: string) => offeneRefs.some((r) => r.startsWith(`kz:${id}:${grund}:`));
  const out: WarnAufgabe[] = [];
  for (const z of zeilen.filter((x) => !x.pausiert)) {
    if (z.ampel === 'rot' && !offen(z.id, 'rot')) {
      out.push({
        agency_id: z.id,
        grund: 'rot',
        title: `🔴 Kunde rot: ${z.name}`,
        description: `Ampel im Kontrollzentrum ist rot:\n- ${z.gruende.join('\n- ')}\nUrsache klären und gegensteuern. Details: /admin/kontrollzentrum`,
        assigned_to: z.csm_user_id,
        quelle_ref: `kz:${z.id}:rot:${heute}`,
      });
    }
    if (z.churn.risiko && !offen(z.id, 'churn')) {
      out.push({
        agency_id: z.id,
        grund: 'churn',
        title: `⚠️ Churn-Risiko: ${z.name}`,
        description: `Kündigungsrisiko laut Kontrollzentrum:\n- ${z.churn.gruende.join('\n- ')}\nKunden anrufen und Termin zur Ergebnis-Besprechung legen. Details: /admin/kontrollzentrum`,
        assigned_to: z.csm_user_id,
        quelle_ref: `kz:${z.id}:churn:${heute}`,
      });
    }
  }
  return out;
}
