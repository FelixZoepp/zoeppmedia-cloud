/**
 * Zeitraum-Auswahl der Statistik-Seite: Voreinstellungen → Berliner Kalendertage (YYYY-MM-DD).
 * Rein und ohne Seiteneffekte – „heute" wird von außen übergeben.
 */

import { istGueltigerTag, tageInklusive, tagPlus, tagTeile } from './berlin';

export type ZeitraumPreset = '7' | '30' | '90' | 'monat' | 'vormonat' | 'eigen';

export const ZEITRAUM_OPTIONEN: Array<{ value: ZeitraumPreset; label: string }> = [
  { value: '7', label: '7 Tage' },
  { value: '30', label: '30 Tage' },
  { value: '90', label: '90 Tage' },
  { value: 'monat', label: 'Dieser Monat' },
  { value: 'vormonat', label: 'Letzter Monat' },
  { value: 'eigen', label: 'Eigener Zeitraum' },
];

/** Längster erlaubter Zeitraum in Kalendertagen */
export const MAX_ZEITRAUM_TAGE = 366;

export type ZeitraumErgebnis = { ok: true; from: string; to: string } | { ok: false; fehler: string };

/** true für die Monats-Voreinstellungen (Beschriftung „ggü. Vormonat") */
export function istMonatsPreset(preset: ZeitraumPreset): boolean {
  return preset === 'monat' || preset === 'vormonat';
}

/**
 * Prüft einen Zeitraum aus Kalendertagen. heute (Berlin) ist optional –
 * ohne heute wird nicht auf Zukunft geprüft (z. B. in den API-Routen).
 */
export function pruefeZeitraum(from: string, to: string, heute?: string): string | null {
  if (!istGueltigerTag(from) || !istGueltigerTag(to)) return 'Bitte gültige Daten für „von" und „bis" angeben.';
  const tage = tageInklusive(from, to);
  if (tage < 1) return '„Bis" darf nicht vor „von" liegen.';
  if (tage > MAX_ZEITRAUM_TAGE) return `Der Zeitraum darf höchstens ${MAX_ZEITRAUM_TAGE} Tage umfassen.`;
  if (heute && to > heute) return '„Bis" darf nicht in der Zukunft liegen.';
  return null;
}

/**
 * Löst eine Voreinstellung in from/to auf (Berliner Kalendertage, beide einschließlich).
 * „7/30/90 Tage" = die letzten N Kalendertage inklusive heute.
 */
export function zeitraumAufloesen(
  preset: ZeitraumPreset,
  heute: string,
  eigen?: { von: string; bis: string },
): ZeitraumErgebnis {
  const t = tagTeile(heute);
  if (!t) return { ok: false, fehler: 'Ungültiges Datum für heute.' };

  switch (preset) {
    case '7':
    case '30':
    case '90':
      return { ok: true, from: tagPlus(heute, -(Number(preset) - 1)), to: heute };
    case 'monat':
      return { ok: true, from: `${heute.slice(0, 7)}-01`, to: heute };
    case 'vormonat': {
      const ersterDiesesMonats = `${heute.slice(0, 7)}-01`;
      const letzterVormonat = tagPlus(ersterDiesesMonats, -1);
      return { ok: true, from: `${letzterVormonat.slice(0, 7)}-01`, to: letzterVormonat };
    }
    case 'eigen': {
      const von = eigen?.von ?? '';
      const bis = eigen?.bis ?? '';
      const fehler = pruefeZeitraum(von, bis, heute);
      return fehler ? { ok: false, fehler } : { ok: true, from: von, to: bis };
    }
  }
}
