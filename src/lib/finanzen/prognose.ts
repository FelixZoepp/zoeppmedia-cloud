/**
 * Hochlauf-Prognose im Masterplan: Wie entwickelt sich der Monatsumsatz bei X Abschlüssen pro Monat –
 * und was braucht es dafür im Funnel (Leads, Settings, Closings, Werbung, Kapazität)? Rein, testbar.
 *
 * Kundenmodell (Angabe Felix, Lexware bestätigt): Einstieg 2.000 Setup + 3 × 1.000, danach buchen ~75 % ein Jahrespaket
 * (15k Basis + Upsells ≈ 3.000 €/Monat). Bestand läuft mit eigenem Churn weiter.
 */

export interface PrognoseAnnahmen {
  abschluesseMonat: number;
  startMrr: number;
  /** Anteil der Abschlüsse, die wirklich starten und zahlen */
  startquote: number;
  upsellQuote: number;
  /** Ø Monatsumsatz nach dem Upsell */
  upsellMonat: number;
  /** Churn pro Monat nach dem Upsell */
  churnUpsell: number;
  /** Churn pro Monat des heutigen Bestands */
  churnBestand: number;
  setup: number;
  einstiegMonat: number;
  einstiegMonate: number;
  /** Ab welchem Monat nach dem Start der Upsell-Umsatz läuft (gemessen: Tage bis Upsell ÷ 30, höchstens einstiegMonate) */
  upsellAbMonat?: number;
}

export const STANDARD_ANNAHMEN: Omit<PrognoseAnnahmen, 'abschluesseMonat' | 'startMrr'> = {
  startquote: 0.75,
  upsellQuote: 0.75,
  upsellMonat: 3000,
  churnUpsell: 0.06,
  churnBestand: 0.05,
  setup: 2000,
  einstiegMonat: 1000,
  einstiegMonate: 3,
};

/** Umsatz je Monat (Index 0 = erster Prognosemonat) */
export function hochlauf(a: PrognoseAnnahmen, monate: number): number[] {
  const starter = a.abschluesseMonat * a.startquote;
  const out: number[] = [];
  let bestand = a.startMrr;
  for (let t = 0; t < monate; t++) {
    let umsatz = bestand;
    bestand *= 1 - a.churnBestand;
    for (let k = 0; k <= t; k++) {
      const alter = t - k;
      const ab = Math.min(a.einstiegMonate, Math.max(1, a.upsellAbMonat ?? a.einstiegMonate));
      if (alter === 0) umsatz += starter * (a.einstiegMonat + a.setup);
      else if (alter < ab) umsatz += starter * a.einstiegMonat;
      else if (alter < a.einstiegMonate)
        // Jahrespaket läuft ab Unterschrift: Upsell-Kunden zahlen schon den Jahresbetrag, die anderen noch den Einstieg
        umsatz += starter * (a.upsellQuote * a.upsellMonat + (1 - a.upsellQuote) * a.einstiegMonat);
      else umsatz += starter * a.upsellQuote * a.upsellMonat * (1 - a.churnUpsell) ** (alter - a.einstiegMonate);
    }
    out.push(Math.round(umsatz));
  }
  return out;
}

/** Erster Monat (Index), in dem das Ziel erreicht ist – null, wenn nicht innerhalb von `max` Monaten */
export function zielErreichtNach(a: PrognoseAnnahmen, ziel: number, max = 60): number | null {
  const r = hochlauf(a, max);
  const i = r.findIndex((x) => x >= ziel);
  return i < 0 ? null : i;
}

/** Wie viele Abschlüsse pro Monat braucht es, um das Ziel nach `monate` Monaten zu erreichen? */
export function abschluesseFuerZiel(basis: Omit<PrognoseAnnahmen, 'abschluesseMonat'>, ziel: number, monate: number): number | null {
  for (let n = 1; n <= 100; n++) {
    const r = hochlauf({ ...basis, abschluesseMonat: n }, monate);
    if (r[monate - 1] >= ziel) return n;
  }
  return null;
}

export interface FunnelZahlen {
  ausgaben: number;
  leads: number;
  settingsGebucht: number;
  settingsGehalten: number;
  closingsGebucht: number;
  closingsGehalten: number;
  abschluesse: number;
  /** davon Upsells bei Bestandskunden (laufen nicht durchs Closing) */
  upsells: number;
}

export interface FunnelQuoten {
  kostenProLead: number | null;
  showSetting: number | null;
  settingZuClosing: number | null;
  showClosing: number | null;
  closingQuote: number | null;
}

export function funnelQuoten(f: FunnelZahlen): FunnelQuoten {
  const q = (a: number, b: number) => (b > 0 ? a / b : null);
  const neu = Math.max(0, f.abschluesse - f.upsells);
  return {
    kostenProLead: q(f.ausgaben, f.leads),
    showSetting: q(f.settingsGehalten, f.settingsGebucht),
    settingZuClosing: q(f.closingsGebucht, f.settingsGehalten),
    showClosing: q(f.closingsGehalten, f.closingsGebucht),
    closingQuote: q(neu, f.closingsGehalten),
  };
}

export interface FunnelBedarf {
  closingsGehalten: number;
  closingsGebucht: number;
  settingsGehalten: number;
  settingsGebucht: number;
  leads: number;
  werbung: number;
  gespraecheProWerktag: number;
}

/** Rückwärts vom Abschlussziel: was braucht es im Funnel pro Monat? (Settings/Leads aus dem Verhältnis Leads → Settings) */
export function funnelBedarf(abschluesse: number, q: FunnelQuoten, f: FunnelZahlen, werktage = 21): FunnelBedarf | null {
  if (!q.closingQuote || !q.showClosing || !q.settingZuClosing || !q.showSetting || !f.leads) return null;
  const closingsGehalten = abschluesse / q.closingQuote;
  const closingsGebucht = closingsGehalten / q.showClosing;
  const settingsGehalten = closingsGebucht / q.settingZuClosing;
  const settingsGebucht = settingsGehalten / q.showSetting;
  const leads = settingsGebucht / (f.settingsGebucht / f.leads);
  const r = (x: number) => Math.ceil(x);
  return {
    closingsGehalten: r(closingsGehalten),
    closingsGebucht: r(closingsGebucht),
    settingsGehalten: r(settingsGehalten),
    settingsGebucht: r(settingsGebucht),
    leads: r(leads),
    werbung: Math.round(leads * (q.kostenProLead ?? 0)),
    gespraecheProWerktag: Math.round(((closingsGebucht + settingsGebucht) / werktage) * 10) / 10,
  };
}

/** Tage vom ersten Kauf bis zum Upsell: Median über alle Upsell-Abschlüsse */
export function medianTageBisUpsell(tage: number[]): number | null {
  const t = tage.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!t.length) return null;
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : Math.round((t[m - 1] + t[m]) / 2);
}
