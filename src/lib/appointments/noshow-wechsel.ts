/**
 * No-Show-Punkte nur beim echten Statuswechsel:
 *  - anderer Status → no_show: +1 Punkt
 *  - no_show → anderer Status (Korrektur): −1 Punkt
 *  - no_show → no_show (erneut gespeichert): nichts
 * Rein, testbar.
 */
export function noShowPunktWechsel(alt: string | null | undefined, neu: string | null | undefined): 1 | -1 | 0 {
  if (!neu || neu === alt) return 0;
  if (neu === 'no_show') return 1;
  if (alt === 'no_show') return -1;
  return 0;
}

/** Automatische Sperre (ab 3 Punkten) – nur die darf beim Zurücknehmen wieder aufgehoben werden */
export const AUTO_SPERRE_PREFIX = 'Automatisch gesperrt:';
