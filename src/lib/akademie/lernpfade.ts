/**
 * Jede Position ist eine eigene Bereichs-Akademie mit Lernpfad (Tag 1 → Woche 1 → Woche 2).
 * Angezeigt werden nur Artikel, die der Nutzer sehen darf. Rein, auch im Client nutzbar.
 */

export const STUFEN = ['Tag 1', 'Woche 1', 'Woche 2'] as const;
export type Stufe = (typeof STUFEN)[number];

export const LERNPFADE: Record<string, Record<Stufe, string[]>> = {
  grundlagen: {
    'Tag 1': ['willkommen', 'mindset', 'cloud-rundgang', 'meine-aufgaben', 'arbeitsplatz-tagesstart', 'arbeitsplatz-verlassen', 'datenschutz-alltag'],
    'Woche 1': ['interne-kommunikation', 'kundenkommunikation', 'kunden-ablauf', 'ki-assistent', 'faq-automatik'],
    'Woche 2': ['beschwerden', 'abwesenheit'],
  },
  innendienst: {
    'Tag 1': ['innendienst-auftrag', 'rolle-innendienst', 'innendienst-anruf', 'skript-innendienst-bewerber'],
    'Woche 1': ['innendienst', 'dialer', 'innendienst-nicht-erreicht', 'whatsapp-inbox', 'termine'],
    'Woche 2': ['innendienst-optout', 'starttermin', 'faq-indeed-lebenslauf'],
  },
  setting: {
    'Tag 1': ['setting-auftrag', 'rolle-setting', 'skript-setting', 'setting-gespraech'],
    'Woche 1': ['setting-followups', 'close-pflege', 'dialer', 'whatsapp-inbox'],
    'Woche 2': ['skript-einwaende'],
  },
  closing: {
    'Tag 1': ['closing-auftrag', 'rolle-closing', 'skript-closing', 'closing-gespraech'],
    'Woche 1': ['after-close', 'close-pflege', 'skript-einwaende'],
    'Woche 2': ['vertrag-bestaetigung', 'testimonial-verlaengerung'],
  },
  csm: {
    'Tag 1': ['csm-auftrag', 'rolle-csm', 'after-close', 'vertrag-bestaetigung'],
    'Woche 1': ['kickoff', 'skript-onboarding-call', 'onboarding-kunde', 'auto-setup', 'freigabe-kunde', 'starttermin'],
    'Woche 2': ['garantie-umfragen', 'testimonial-verlaengerung', 'beschwerden', 'freigabe-prozess', 'offboarding'],
  },
  media_buyer: {
    'Tag 1': ['rolle-media-buyer', 'meta-zugaenge', 'ads-werkstatt', 'creatives-erstellen'],
    'Woche 1': ['meta-richtlinien', 'funnel', 'test-lead', 'meta-kampagne', 'freigabe-prozess', 'indeed-zugang'],
    'Woche 2': ['videos-schneiden', 'skripte-schreiben', 'continuity-check', 'auto-setup', 'onboarding-kunde', 'offboarding', 'faq-indeed-lebenslauf'],
  },
  content: {
    'Tag 1': ['rolle-content', 'skripte-schreiben', 'creatives-erstellen'],
    'Woche 1': ['videos-schneiden', 'freigabe-prozess', 'ads-werkstatt'],
    'Woche 2': ['meta-richtlinien'],
  },
  backoffice: {
    'Tag 1': ['rolle-backoffice', 'setup-rechnung', 'buchhaltung-monat'],
    'Woche 1': ['mahnwesen', 'umsatz-analyse'],
    'Woche 2': [],
  },
  ops: {
    'Tag 1': ['rolle-ops', 'ops-systemcheck'],
    'Woche 1': [],
    'Woche 2': [],
  },
  vertriebsleitung: {
    'Tag 1': ['rolle-vertriebsleitung', 'vertriebsleitung-routine', 'sales-controlling'],
    'Woche 1': ['close-pflege'],
    'Woche 2': [],
  },
  fuehrung: {
    'Tag 1': ['rolle-fuehrung', 'after-close', 'sales-controlling', 'umsatz-analyse'],
    'Woche 1': ['ops-systemcheck', 'vertrag-bestaetigung', 'setup-rechnung'],
    'Woche 2': [],
  },
};

export interface LernpfadArtikel {
  slug: string;
  titel: string;
  typ: string;
  positionen: string[];
  status?: string;
}

export interface LernpfadStufe<T> {
  stufe: Stufe;
  artikel: T[];
}

/**
 * Lernpfad einer Position aus den sichtbaren Artikeln. Artikel der Position, die in keinem Pfad stehen,
 * kommen unter „weiteres“ (Wissen, FAQ, Ergänzungen von Felix).
 */
export function lernpfadFuer<T extends LernpfadArtikel>(position: string, sichtbar: T[]): { stufen: LernpfadStufe<T>[]; weiteres: T[] } {
  const pfad = LERNPFADE[position] ?? { 'Tag 1': [], 'Woche 1': [], 'Woche 2': [] };
  const bySlug = new Map(sichtbar.map((a) => [a.slug, a]));
  const imPfad = new Set<string>();
  const stufen = STUFEN.map((stufe) => {
    const artikel = pfad[stufe].map((s) => bySlug.get(s)).filter((a): a is T => !!a);
    for (const a of artikel) imPfad.add(a.slug);
    return { stufe, artikel };
  });
  const weiteres = sichtbar.filter((a) => a.positionen.includes(position) && !imPfad.has(a.slug));
  return { stufen, weiteres };
}

/** Fortschritt einer Bereichs-Akademie: gelesene Artikel des Lernpfads */
export function fortschrittVon(slugs: string[], fortschritt: Record<string, { gelesen: boolean }>): { gelesen: number; gesamt: number; prozent: number } {
  const gesamt = slugs.length;
  const gelesen = slugs.filter((s) => fortschritt[s]?.gelesen).length;
  return { gelesen, gesamt, prozent: gesamt ? Math.round((gelesen / gesamt) * 100) : 0 };
}
