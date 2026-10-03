/**
 * Fulfillment v2: Phasen und Schritte eines Kunden.
 *
 * Zahlung → Onboarding → Setup → Continuity → Offboarding
 *
 * Jeder Schritt ist entweder "kunde" (erscheint unter "Deine Aufgaben" im Portal)
 * oder "zoepp" (erscheint unter "Meine Aufgaben" bei der zuständigen Funktion).
 * `frist_tage` zählt ab Start der Phase (Continuity: ab Kampagnenstart).
 * `auto` = Signal, mit dem die Cloud den Schritt selbst abhakt (siehe signals.ts).
 *
 * Sind alle Schritte einer Phase erledigt/nicht nötig, rutscht der Kunde in die nächste
 * Phase und deren Schritte werden angelegt. Offboarding wird nur manuell gestartet.
 */

export type Phase = 'zahlung' | 'onboarding' | 'setup' | 'continuity' | 'offboarding' | 'beendet';

/** Zuständige Funktion intern (users.funktion): Nils = media_buyer, Petra = backoffice, Felix = csm */
export type Funktion = 'csm' | 'media_buyer' | 'backoffice' | 'content' | 'ops';

export type AutoSignal =
  | 'kickoff_gebucht'
  | 'transkript_hochgeladen'
  | 'kunde_eingeloggt'
  | 'onboarding_formular'
  | 'whatsapp_verbunden'
  | 'werbekonto_verbunden'
  | 'testimonial_gebucht'
  | 'ad_ideen_angelegt';

export interface StepDef {
  key: string;
  phase: Phase;
  titel: string;
  beschreibung?: string;
  wer: 'kunde' | 'zoepp';
  /** intern zuständig — bei Kunden-Schritten: wer prüft ("zur Prüfung") */
  funktion: Funktion;
  frist_tage: number;
  auto?: AutoSignal;
  /** Kunden-Schritt landet nach "Erledigt" erst zur Prüfung beim Team */
  pruefen?: boolean;
  /** Anleitung für Kunden-Schritte (Portal) */
  anleitung?: { schritte: string[]; pdf_seiten?: string };
  /** optional: Schritt darf übersprungen werden ("nicht nötig") */
  optional?: boolean;
}

export const PHASES: Array<{ key: Phase; label: string; farbe: string; beschreibung: string }> = [
  { key: 'zahlung', label: 'Zahlungsabwicklung', farbe: 'bg-yellow-400', beschreibung: 'Einrichtungsgebühr ist immer der erste Schritt' },
  { key: 'onboarding', label: 'Onboarding', farbe: 'bg-orange-500', beschreibung: 'Kick-off, Inhalte und Zugänge vom Kunden' },
  { key: 'setup', label: 'Setup-Phase', farbe: 'bg-stone-500', beschreibung: 'Skripte, Grafiken, Funnel, Werbemanager, Launch' },
  { key: 'continuity', label: 'Continuity', farbe: 'bg-rose-600', beschreibung: 'Kampagne läuft: Ads + Tracking prüfen, Tag 7 bis 90' },
  { key: 'offboarding', label: 'Offboarding', farbe: 'bg-teal-700', beschreibung: 'Sauber beenden, Testimonial sichern' },
];

/** Meta-Partner-ID von Zoepp Media — alle Einladungen als Partner an diese ID */
export const META_PARTNER_ID = '175192705159272';
export const META_CHECKLISTE_PDF = '/downloads/checkliste-meta-business-manager.pdf';

const meta = (
  key: string,
  titel: string,
  schritte: string[],
  pdf_seiten: string,
): StepDef => ({
  key,
  phase: 'onboarding',
  titel,
  wer: 'kunde',
  funktion: 'media_buyer',
  frist_tage: 3,
  pruefen: true,
  anleitung: { schritte, pdf_seiten },
});

export const STEPS: StepDef[] = [
  // ── 1 · Zahlungsabwicklung ───────────────────────────────────────────────
  { key: 'z_vertrag', phase: 'zahlung', titel: 'Vertrag unterschrieben', wer: 'zoepp', funktion: 'csm', frist_tage: 0 },
  { key: 'z_rechnung_setup', phase: 'zahlung', titel: 'Rechnung Einrichtungsgebühr geschrieben', wer: 'zoepp', funktion: 'backoffice', frist_tage: 0 },
  {
    key: 'z_zahlung_setup', phase: 'zahlung', titel: 'Zahlungseingang Einrichtungsgebühr',
    beschreibung: 'Erst nach Zahlungseingang startet das Onboarding.', wer: 'zoepp', funktion: 'backoffice', frist_tage: 7,
  },

  // ── 2 · Onboarding ───────────────────────────────────────────────────────
  { key: 'o_kickoff_gebucht', phase: 'onboarding', titel: 'Kick-off-Meeting gebucht', wer: 'kunde', funktion: 'csm', frist_tage: 1, auto: 'kickoff_gebucht' },
  { key: 'o_kickoff', phase: 'onboarding', titel: 'Kick-off-Meeting durchgeführt', wer: 'zoepp', funktion: 'csm', frist_tage: 3 },
  { key: 'o_transkript', phase: 'onboarding', titel: 'Transkript hochgeladen', wer: 'zoepp', funktion: 'csm', frist_tage: 3, auto: 'transkript_hochgeladen' },
  { key: 'o_cloud_login', phase: 'onboarding', titel: 'In der Zoepp Cloud eingeloggt', wer: 'kunde', funktion: 'csm', frist_tage: 1, auto: 'kunde_eingeloggt' },
  {
    key: 'o_inhaltsfunnel', phase: 'onboarding', titel: 'Inhaltsfunnel ausgefüllt',
    beschreibung: 'Das Onboarding-Formular mit allen Infos zu Unternehmen, Stelle und Angebot.',
    wer: 'kunde', funktion: 'csm', frist_tage: 2, auto: 'onboarding_formular',
  },
  {
    key: 'o_bilder', phase: 'onboarding', titel: 'Bilder & Branding hochgeladen',
    beschreibung: 'Logo, Farben, Fotos vom Team und vom Arbeitsalltag.', wer: 'kunde', funktion: 'media_buyer', frist_tage: 3, pruefen: true,
  },
  meta('o_meta_seite', 'Zugriff auf Facebook-Seite gegeben', [
    'Meta Business Suite öffnen und mit FACEBOOK anmelden (nicht Instagram)',
    'Falls noch keins da: oben links "Business-Portfolio erstellen" mit deinem Firmennamen',
    'Einstellungen → Konten → Seiten: Seite auswählen (oder "Neue Facebook-Seite erstellen", Kategorie Produkt/Dienstleistung)',
    `"Partner zuweisen" → "Unternehmens-ID" → ${META_PARTNER_ID} eintragen → volle Kontrolle → Zuweisen`,
  ], 'S. 4–8'),
  meta('o_meta_instagram', 'Zugriff auf Instagram-Konto gegeben', [
    'Einstellungen → Konten → Instagram-Konten → "Hinzufügen" → Konto beanspruchen',
    'Rechts runterscrollen, Bedingungen bestätigen, "Instagram-Konto beanspruchen"',
    `Beim Konto "Partner zuweisen" → ${META_PARTNER_ID} → alle Schalter an → Zuweisen`,
  ], 'S. 12–13'),
  meta('o_meta_werbekonto', 'Zugriff auf Werbekonto gegeben', [
    'Einstellungen → Konten → Werbekonten → "Hinzufügen" → "Neues Werbekonto erstellen"',
    'Name = Firmenname, Zeitzone Europe/Berlin, Währung EUR → "Mein Unternehmen" → erstellen',
    `"Partner zuweisen" → ${META_PARTNER_ID} → "Werbekonten verwalten" (volle Kontrolle) → Zuweisen`,
  ], 'S. 9–11'),
  meta('o_meta_pixel', 'Zugriff auf Pixel gegeben', [
    'Einstellungen → Datenquellen → Datensätze → "Hinzufügen" → Name = Firmenname → Erstellen',
    `"Partner zuweisen" → ${META_PARTNER_ID} → "Event-Datensatz verwalten" → Zuweisen`,
    'Klappt das nicht: beim Pixel "Assets zuweisen" → dein Werbekonto auswählen → Hinzufügen',
  ], 'S. 14–16'),
  meta('o_meta_domain', 'Domain bei Facebook verifiziert', [
    'Einstellungen → Brand Safety → Domains → "Hinzufügen" → "Domain erstellen", Domain ohne www',
    '"Domain verifizieren" → Option "DNS TXT-Datensatz" wählen → Text kopieren',
    'Bei deinem Domain-Anbieter einen TXT-Eintrag mit diesem Text anlegen, dann "Domain verifizieren"',
    `"Partner zuweisen" → ${META_PARTNER_ID} → "Mit Domain verlinken" → Zuweisen`,
  ], 'S. 17–20'),
  meta('o_meta_zahlung', 'Zahlungsmethode im Werbekonto hinterlegt', [
    'Werbekonto öffnen → Abrechnung & Zahlungen → Zahlungsmethode hinzufügen',
  ], 'S. 2'),
  { key: 'o_indeed', phase: 'onboarding', titel: 'Indeed-Zugang gegeben', wer: 'kunde', funktion: 'media_buyer', frist_tage: 3, pruefen: true, optional: true },
  { key: 'o_whatsapp', phase: 'onboarding', titel: 'WhatsApp-Nummer verbunden', wer: 'kunde', funktion: 'csm', frist_tage: 3, auto: 'whatsapp_verbunden', optional: true },
  { key: 'o_zugaenge_geprueft', phase: 'onboarding', titel: 'Alle Zugänge geprüft', beschreibung: 'Seite, Instagram, Werbekonto, Pixel, Domain, Zahlungsmethode funktionieren.', wer: 'zoepp', funktion: 'media_buyer', frist_tage: 4 },
  {
    key: 'o_systemnutzer', phase: 'onboarding', titel: 'Systemnutzer zugewiesen & Werbekonto-ID eingetragen',
    beschreibung: 'Im Business Manager unseren Systemnutzer dem Werbekonto des Kunden zuweisen, dann beim Kunden unter Integrationen die Werbekonto-ID eintragen – ab dann zieht die Cloud täglich die Werbedaten.',
    wer: 'zoepp', funktion: 'media_buyer', frist_tage: 4, auto: 'werbekonto_verbunden',
  },

  // ── 3 · Setup ────────────────────────────────────────────────────────────
  {
    key: 's_ideen', phase: 'setup', titel: 'Ad-Ideen angelegt (Video-Skripte oder Grafik-Ideen)',
    beschreibung: 'Im Ads-Board pro Idee eine Karte anlegen. Video-Skripte nur, wenn der Kunde Videos macht – sonst Grafik-Ideen.',
    wer: 'zoepp', funktion: 'media_buyer', frist_tage: 2, auto: 'ad_ideen_angelegt',
  },
  { key: 's_grafiken', phase: 'setup', titel: 'Grafiken gebaut', beschreibung: '3–5 Bild-Ads.', wer: 'zoepp', funktion: 'media_buyer', frist_tage: 3 },
  { key: 's_funnel', phase: 'setup', titel: 'Funnel aufgebaut', beschreibung: 'Perspective-Template, Branding, Texte, Formular, Danke-Seite.', wer: 'zoepp', funktion: 'media_buyer', frist_tage: 4 },
  { key: 's_funnel_tracking', phase: 'setup', titel: 'Funnel-Domain & Pixel eingerichtet', wer: 'zoepp', funktion: 'media_buyer', frist_tage: 4 },
  { key: 's_testlead', phase: 'setup', titel: 'Test-Lead durchgespielt', beschreibung: 'Funnel → Cloud → WhatsApp einmal komplett.', wer: 'zoepp', funktion: 'media_buyer', frist_tage: 5 },
  { key: 's_werbemanager', phase: 'setup', titel: 'Werbemanager eingerichtet', beschreibung: 'Conversion-Events, Kampagne, Zielgruppe, Budget.', wer: 'zoepp', funktion: 'media_buyer', frist_tage: 5 },
  { key: 's_ads_vorbereitet', phase: 'setup', titel: 'Ads vorbereitet', wer: 'zoepp', funktion: 'media_buyer', frist_tage: 5 },
  {
    key: 's_freigabe', phase: 'setup', titel: 'Ads & Texte freigegeben',
    beschreibung: 'Bitte schau dir die Ads und Texte an und gib sie frei – oder schreib uns, was wir ändern sollen.',
    wer: 'kunde', funktion: 'media_buyer', frist_tage: 7,
  },
  { key: 's_starttermin', phase: 'setup', titel: 'Starttermin vereinbart', wer: 'zoepp', funktion: 'csm', frist_tage: 7 },
  { key: 's_launch', phase: 'setup', titel: 'Kampagne live', beschreibung: 'Ads und Indeed-Anzeige gestartet, Kunde informiert.', wer: 'zoepp', funktion: 'media_buyer', frist_tage: 8 },

  // ── 4 · Continuity (Fristen ab Kampagnenstart) ───────────────────────────
  ...[7, 14, 30, 45, 60, 75].map((tag): StepDef => ({
    key: `c_check_${tag}`, phase: 'continuity', titel: `Anzeigen + Tracking prüfen (Tag ${tag})`,
    wer: 'zoepp', funktion: 'media_buyer', frist_tage: tag,
  })),
  {
    key: 'c_testimonial_termin', phase: 'continuity', titel: 'Testimonial-Termin gebucht',
    beschreibung: 'Bitte buch dir einen kurzen Termin für dein Testimonial – wir nehmen es gemeinsam auf.',
    wer: 'kunde', funktion: 'csm', frist_tage: 30, auto: 'testimonial_gebucht',
  },
  { key: 'c_testimonial', phase: 'continuity', titel: 'Testimonial aufgenommen', wer: 'zoepp', funktion: 'csm', frist_tage: 45 },
  { key: 'c_check_90', phase: 'continuity', titel: 'Anzeigen + Tracking prüfen + Upsell (Tag 90)', beschreibung: 'Spätestens hier Upsell/Verlängerung ansprechen.', wer: 'zoepp', funktion: 'csm', frist_tage: 90 },

  // ── 5 · Offboarding (manuell gestartet) ──────────────────────────────────
  { key: 'off_kuendigung', phase: 'offboarding', titel: 'Kündigung erfasst', wer: 'zoepp', funktion: 'csm', frist_tage: 0 },
  { key: 'off_kampagnen', phase: 'offboarding', titel: 'Kampagnen pausiert', wer: 'zoepp', funktion: 'media_buyer', frist_tage: 1 },
  { key: 'off_zugaenge', phase: 'offboarding', titel: 'Zugänge übergeben/entfernt', wer: 'zoepp', funktion: 'media_buyer', frist_tage: 3 },
  { key: 'off_report', phase: 'offboarding', titel: 'Abschlussreport geschickt', wer: 'zoepp', funktion: 'csm', frist_tage: 5 },
  { key: 'off_testimonial', phase: 'offboarding', titel: 'Testimonial angefragt', wer: 'zoepp', funktion: 'csm', frist_tage: 5, optional: true },
  { key: 'off_cloud', phase: 'offboarding', titel: 'Cloud-Zugang deaktiviert', wer: 'zoepp', funktion: 'csm', frist_tage: 7 },
];

export const STEP_BY_KEY = new Map(STEPS.map((s) => [s.key, s]));

export function stepsForPhase(phase: Phase): StepDef[] {
  return STEPS.filter((s) => s.phase === phase);
}

/** Phase, die nach `phase` kommt (Continuity bleibt bis zum manuellen Offboarding stehen). */
export function nextPhase(phase: Phase): Phase | null {
  switch (phase) {
    case 'zahlung': return 'onboarding';
    case 'onboarding': return 'setup';
    case 'setup': return 'continuity';
    case 'offboarding': return 'beendet';
    default: return null;
  }
}

export function phaseLabel(phase: Phase): string {
  return PHASES.find((p) => p.key === phase)?.label ?? (phase === 'beendet' ? 'Beendet' : phase);
}

/** Alte Pipeline-Phase (phase_override) → neue Phase, für die einmalige Übernahme der Bestandskunden. */
export function mapLegacyPhase(legacy: string | null, onboardingCompleted: boolean): Phase {
  switch (legacy) {
    case 'onboarding_termin':
    case 'warten_zugaenge':
      return 'onboarding';
    case 'fulfillment':
    case 'warten_starttermin':
    case 'kampagne_starten':
      return 'setup';
    case 'kampagne_live':
    case 'kickoff_14d':
    case 'bestandskunde':
      return 'continuity';
    default:
      return onboardingCompleted ? 'setup' : 'onboarding';
  }
}
