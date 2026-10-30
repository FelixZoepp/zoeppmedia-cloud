/**
 * KPI-Übersicht im Cash-Plan: alle Kennzahlen von Werbung bis Zahlung mit Ist, Ziel, Status und Optimierungsvorschlag.
 * Rein, testbar – die Werte kommen aus den bestehenden Berechnungen (Funnel, Kundenhistorie, Lexware, Ausgaben).
 */

export type KpiFormat = 'euro' | 'prozent' | 'zahl' | 'tage';

export interface Kpi {
  bereich: 'Marketing' | 'Sales' | 'Upsell & Kunden' | 'Finanzen';
  name: string;
  ist: number | null;
  ziel: number;
  /** true = höher ist besser */
  hoeherBesser: boolean;
  format: KpiFormat;
  /** Vorschlag, wenn das Ziel verfehlt ist */
  tipp: string;
}

export interface KpiStatus extends Kpi {
  status: 'gut' | 'knapp' | 'schlecht' | 'offen';
}

/** gut = Ziel erreicht, knapp = bis 15 % daneben, schlecht = mehr */
export function bewerte(k: Kpi): KpiStatus {
  if (k.ist == null) return { ...k, status: 'offen' };
  const ok = k.hoeherBesser ? k.ist >= k.ziel : k.ist <= k.ziel;
  if (ok) return { ...k, status: 'gut' };
  const abstand = k.ziel ? Math.abs(k.ist - k.ziel) / Math.abs(k.ziel) : 1;
  return { ...k, status: abstand <= 0.15 ? 'knapp' : 'schlecht' };
}

export interface KpiEingaben {
  kostenProLead: number | null;
  showSetting: number | null;
  settingZuClosing: number | null;
  showClosing: number | null;
  closingQuote: number | null;
  upsellQuote: number | null;
  tageBisUpsell: number | null;
  startquote: number | null;
  tageBisErstesGeld: number | null;
  churn: number | null;
  rueckgewinnungen: number | null;
  marge: number | null;
  werbeanteil: number | null;
  tageBisZahlung: number | null;
  puenktlich: number | null;
  ueberfaelligBrutto: number | null;
  offeneRechnungenFehlen: number | null;
  kundenProKopf: number | null;
  zielKundenProKopf: number;
}

export function kpiListe(e: KpiEingaben): KpiStatus[] {
  const k: Kpi[] = [
    {
      bereich: 'Marketing',
      name: 'Kosten pro Lead',
      ist: e.kostenProLead,
      ziel: 120,
      hoeherBesser: false,
      format: 'euro',
      tipp: 'Creatives wöchentlich rotieren (Gewinner-Hook behalten, Rest testen), Retargeting auf Funnel-Besucher, Formular auf 3 Fragen kürzen.',
    },
    {
      bereich: 'Sales',
      name: 'Show-Quote Setting',
      ist: e.showSetting,
      ziel: 0.85,
      hoeherBesser: true,
      format: 'prozent',
      tipp: 'Termin innerhalb von 24 h legen, WhatsApp-Erinnerung am Vortag + 1 h vorher, bei No-Show sofort Rückruf (No-Show-Kette ist frei).',
    },
    {
      bereich: 'Sales',
      name: 'Setting → Closing gebucht',
      ist: e.settingZuClosing,
      ziel: 0.85,
      hoeherBesser: true,
      format: 'prozent',
      tipp: 'Closing direkt im Setting-Gespräch fest einbuchen (nicht „ich melde mich“), Entscheider gleich mit einladen.',
    },
    {
      bereich: 'Sales',
      name: 'Show-Quote Closing',
      ist: e.showClosing,
      ziel: 0.9,
      hoeherBesser: true,
      format: 'prozent',
      tipp: 'Closing höchstens 48 h nach dem Setting, Vorab-Video/Case schicken, Erinnerung mit Agenda.',
    },
    {
      bereich: 'Sales',
      name: 'Closing-Quote Neukunden',
      ist: e.closingQuote,
      ziel: 0.6,
      hoeherBesser: true,
      format: 'prozent',
      tipp: 'Offene Follow-ups und Angebote in Close täglich abarbeiten (Ziel: kein Deal > 7 Tage ohne Bewegung), Einwände je Verlustgrund auswerten.',
    },
    {
      bereich: 'Upsell & Kunden',
      name: 'Startquote (Abschluss → erste Zahlung)',
      ist: e.startquote,
      ziel: 0.9,
      hoeherBesser: true,
      format: 'prozent',
      tipp: 'Setup-Rechnung sofort bei Unterschrift, Start-Termin im Closing fest vereinbaren, Zugänge per Checkliste in 48 h einsammeln.',
    },
    {
      bereich: 'Upsell & Kunden',
      name: 'Tage vom Abschluss bis zum ersten Geld',
      ist: e.tageBisErstesGeld,
      ziel: 7,
      hoeherBesser: false,
      format: 'tage',
      tipp: 'Rechnung direkt nach dem Closing raus (Zahlungsziel 7 Tage), Lastschrift/Stripe statt Überweisung.',
    },
    {
      bereich: 'Upsell & Kunden',
      name: 'Upsell-Quote (Direktvertrieb)',
      ist: e.upsellQuote,
      ziel: 0.75,
      hoeherBesser: true,
      format: 'prozent',
      tipp: 'Festen Upsell-Termin mit Ergebnis-Auswertung in Woche 3–4 legen, Jahrespaket mit Anrechnung des Einstiegs anbieten.',
    },
    {
      bereich: 'Upsell & Kunden',
      name: 'Tage bis zum Upsell',
      ist: e.tageBisUpsell,
      ziel: 30,
      hoeherBesser: false,
      format: 'tage',
      tipp: 'Upsell-Gespräch schon beim Start terminieren; erste Ergebnisse (Bewerber, Starts) nach 14 Tagen als Aufhänger nutzen.',
    },
    {
      bereich: 'Upsell & Kunden',
      name: 'Churn pro Monat (Direktvertrieb)',
      ist: e.churn,
      ziel: 0.04,
      hoeherBesser: false,
      format: 'prozent',
      tipp: 'Verlängerung 60 Tage vor Laufzeitende ansprechen, Ergebnis-Report alle 14 Tage, Warnung bei sinkenden Bewerberzahlen sofort an den Kunden.',
    },
    {
      bereich: 'Upsell & Kunden',
      name: 'Rückgewinnungen (gesamt)',
      ist: e.rueckgewinnungen,
      ziel: 5,
      hoeherBesser: true,
      format: 'zahl',
      tipp: 'Ehemalige Kunden nach 60 und 120 Tagen mit neuem Angebot/Case anrufen (Liste: Kundenhistorie, „weg“).',
    },
    {
      bereich: 'Upsell & Kunden',
      name: 'Kunden pro Fulfillment-Person',
      ist: e.kundenProKopf,
      ziel: e.zielKundenProKopf,
      hoeherBesser: true,
      format: 'zahl',
      tipp: 'Onboarding, Reports und Kampagnen-Setup weiter in der Cloud automatisieren – Ziel 80–100 Kunden pro Kopf.',
    },
    {
      bereich: 'Finanzen',
      name: 'Marge (Überschuss / Einnahmen)',
      ist: e.marge,
      ziel: 0.4,
      hoeherBesser: true,
      format: 'prozent',
      tipp: 'Fixkosten prüfen (Tools doppelt? Miete privat?), Preise der Einstiegspakete mit Ergebnis-Garantie erhöhen.',
    },
    {
      bereich: 'Finanzen',
      name: 'Werbung im Verhältnis zur MRR',
      ist: e.werbeanteil,
      ziel: 0.25,
      hoeherBesser: false,
      format: 'prozent',
      tipp: 'Budget nur in Kampagnen mit Abschlüssen erhöhen (Kosten je Kampagne im Meta-Abgleich), Rest pausieren.',
    },
    {
      bereich: 'Finanzen',
      name: 'Ø Tage bis Zahlung',
      ist: e.tageBisZahlung,
      ziel: 10,
      hoeherBesser: false,
      format: 'tage',
      tipp: 'Zahlungsziel 7 Tage, automatische Zahlungserinnerung nach 3 Tagen Verzug (Mahnwesen in der Cloud), Lastschrift anbieten.',
    },
    {
      bereich: 'Finanzen',
      name: 'Pünktlich bezahlt',
      ist: e.puenktlich,
      ziel: 0.8,
      hoeherBesser: true,
      format: 'prozent',
      tipp: 'Säumige Kunden auf Lastschrift umstellen, Leistung bei > 14 Tagen Verzug pausieren (steht im Vertrag).',
    },
    {
      bereich: 'Finanzen',
      name: 'Überfällig (12 Monate, brutto)',
      ist: e.ueberfaelligBrutto,
      ziel: 5000,
      hoeherBesser: false,
      format: 'euro',
      tipp: 'Überfällige Liste wöchentlich durchtelefonieren; Setups nicht gestarteter Kunden (Rönnefahrt, Schweikert, Orkanor) zuerst.',
    },
    {
      bereich: 'Finanzen',
      name: 'Vergessene Rechnungen (Monate mit Lücke)',
      ist: e.offeneRechnungenFehlen,
      ziel: 0,
      hoeherBesser: false,
      format: 'zahl',
      tipp: 'Rechnungsplan im Cash-Plan zum Rechnungstag abhaken; Lücken sofort nachberechnen.',
    },
  ];
  return k.map(bewerte);
}
