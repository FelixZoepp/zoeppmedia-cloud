/**
 * Probetag-Format je Kunde (agencies.settings.probetag_tage): Vertriebe arbeiten unterschiedlich –
 * ein Probetag, drei Probetage hintereinander oder eine Probewoche (5 Werktage).
 * Rein (keine I/O).
 */

export const PROBETAG_OPTIONEN = [
  { value: '1', label: '1 Probetag' },
  { value: '3', label: '3 Probetage hintereinander' },
  { value: '5', label: '1 Probewoche (5 Tage)' },
] as const;

export function probetagTage(settings: unknown): number {
  const n = Number((settings as { probetag_tage?: unknown } | null)?.probetag_tage);
  return n === 3 || n === 5 ? n : 1;
}

export function probetagLabel(tage: number): string {
  return tage === 5 ? 'Probewoche' : tage > 1 ? `${tage} Probetage` : 'Probetag';
}

/** Die einzelnen Probetage ab dem gewählten Start: aufeinanderfolgende Werktage (Mo–Fr), jeweils zur selben Uhrzeit */
export function probetagZeiten(start: Date, tage: number, minuten: number): Array<{ start: Date; ende: Date }> {
  const zeiten: Array<{ start: Date; ende: Date }> = [];
  const t = new Date(start);
  while (zeiten.length < Math.max(1, tage)) {
    const wochentag = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short' }).format(t);
    // Der erste Tag zählt immer (der Kunde hat ihn bewusst gewählt), danach Wochenenden überspringen
    if (zeiten.length === 0 || (wochentag !== 'Sat' && wochentag !== 'Sun')) {
      zeiten.push({ start: new Date(t), ende: new Date(t.getTime() + minuten * 60_000) });
    }
    t.setTime(t.getTime() + 24 * 3600_000);
  }
  return zeiten;
}
