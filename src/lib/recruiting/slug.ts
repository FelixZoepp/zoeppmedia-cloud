// Slug-Generierung für Jobs und Agencies (gleiche Regex wie agencies-Migration 000001)

const UMLAUT_MAP: Record<string, string> = {
  'ae': 'ae', 'oe': 'oe', 'ue': 'ue',
  'ss': 'ss',
  '\u00e4': 'ae', '\u00f6': 'oe', '\u00fc': 'ue', '\u00df': 'ss',
  '\u00c4': 'ae', '\u00d6': 'oe', '\u00dc': 'ue',
};

export function generateSlug(title: string): string {
  let s = title.toLowerCase().trim();
  // Umlaute ersetzen
  s = s.replace(/[äöüßÄÖÜ]/g, (match) => UMLAUT_MAP[match] || match);
  // Alles ausser a-z, 0-9 -> Bindestrich
  s = s.replace(/[^a-z0-9]+/g, '-');
  // Fuehrende/Endende Bindestriche entfernen
  s = s.replace(/^-+|-+$/g, '');
  return s || 'stelle';
}
