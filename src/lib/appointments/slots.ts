/**
 * Slot-Engine — reine Funktion ohne DB-Abhängigkeiten.
 * Berechnet verfügbare Buchungsslots auf Basis von Verfügbarkeitsregeln,
 * bereits gebuchten Terminen, Pufferzeiten und DST-sicherer Zeitzonenlogik.
 *
 * Zeitzonenbehandlung ausschließlich über die Intl-API (kein npm-Paket).
 */

export interface SlotInput {
  rules: Array<{ weekday: number; start_time: string; end_time: string }>;
  bookedSlots: Array<{ starts_at: string; ends_at: string }>;
  from: Date;
  days: number;          // Standard: 14
  durationMinutes: number;
  bufferMinutes: number;
  timezone: string;      // z. B. 'Europe/Berlin'
}

export interface Slot {
  start: Date;
  end: Date;
}

/**
 * Berechnet alle freien Buchungsslots im angegebenen Zeitraum.
 *
 * @param input - Eingabeparameter mit Regeln, gebuchten Slots und Zeiteinstellungen
 * @returns Array verfügbarer Slots als UTC-Datumsobjekte
 */
export function computeSlots(input: SlotInput): Slot[] {
  const { rules, bookedSlots, from, days = 14, durationMinutes, bufferMinutes, timezone } = input;

  // Leere Regeln → keine Slots möglich
  if (rules.length === 0) return [];

  const slots: Slot[] = [];
  const now = new Date();
  // Mindestvorlaufzeit: 2 Stunden ab jetzt
  const cutoff = new Date(now.getTime() + 2 * 60 * 60_000);

  // Regeln nach Wochentag indexieren (0=Sonntag, 1=Montag, ..., 6=Samstag)
  const rulesByDay = new Map<number, Array<{ start_time: string; end_time: string }>>();
  for (const rule of rules) {
    if (!rulesByDay.has(rule.weekday)) rulesByDay.set(rule.weekday, []);
    rulesByDay.get(rule.weekday)!.push(rule);
  }

  // Kurzname → Nummer für Wochentage (en-US)
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  // Tag für Tag iterieren
  for (let d = 0; d < days; d++) {
    // Referenzpunkt: from + d Tage in UTC (wird nur für Wochentag-Bestimmung genutzt)
    const dayRef = new Date(from.getTime() + d * 24 * 60 * 60_000);

    // Wochentag in der Zielzeitzone bestimmen
    const weekdayStr = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: timezone,
    }).format(dayRef);
    const weekday = weekdayMap[weekdayStr] ?? -1;

    const dayRules = rulesByDay.get(weekday);
    if (!dayRules) continue;

    for (const rule of dayRules) {
      // Lokale Start- und Endzeit DST-sicher in UTC umrechnen
      const windowStart = localTimeToUtc(dayRef, rule.start_time, timezone);
      const windowEnd = localTimeToUtc(dayRef, rule.end_time, timezone);

      let cursor = windowStart.getTime();
      const slotMs = durationMinutes * 60_000;
      const bufferMs = bufferMinutes * 60_000;

      // Slots lückenlos innerhalb des Zeitfensters generieren
      while (cursor + slotMs <= windowEnd.getTime()) {
        const slotStart = new Date(cursor);
        const slotEnd = new Date(cursor + slotMs);

        // Vorlaufzeit-Prüfung: Slot muss mind. 2h in der Zukunft liegen
        if (slotStart >= cutoff) {
          // Puffer-Prüfung gegen alle gebuchten Termine
          const blocked = bookedSlots.some(b => {
            const bStart = new Date(b.starts_at).getTime();
            const bEnd = new Date(b.ends_at).getTime();
            // Slot überschneidet sich mit [bStart - buffer, bEnd + buffer]
            return slotStart.getTime() < bEnd + bufferMs && slotEnd.getTime() > bStart - bufferMs;
          });

          if (!blocked) {
            slots.push({ start: slotStart, end: slotEnd });
          }
        }

        cursor += slotMs;
      }
    }
  }

  return slots;
}

/**
 * Rechnet eine lokale Uhrzeit (HH:MM:SS) an einem Referenztag in UTC um.
 * DST-sicher: Verwendet Intl API, kein npm-Paket erforderlich.
 *
 * Algorithmus: Zuerst das lokale Datum im Ziel-Timezone ermitteln,
 * dann eine binäre Suche / iterative Korrektur nutzen, um den genauen
 * UTC-Zeitstempel zu finden, der der lokalen Ortszeit entspricht.
 *
 * @param dayRef   - Referenzdatum (beliebige Zeit desselben Tages in UTC)
 * @param timeStr  - Lokale Uhrzeit im Format HH:MM:SS
 * @param timezone - IANA-Zeitzonenname (z. B. 'Europe/Berlin')
 */
function localTimeToUtc(dayRef: Date, timeStr: string, timezone: string): Date {
  // Lokales Datum (YYYY-MM-DD) im Ziel-Timezone ermitteln
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dayRef); // Ergibt 'YYYY-MM-DD' (en-CA liefert ISO-Format)

  // Naiver UTC-Kandidat: lokale Uhrzeit als ob es UTC wäre
  const [h, m, s] = timeStr.split(':').map(Number);
  const naiveUtcMs = new Date(`${dateParts}T00:00:00Z`).getTime()
    + h * 3_600_000
    + m * 60_000
    + (s || 0) * 1_000;

  // Tatsächlichen UTC-Offset der Zielzone für diesen Zeitpunkt berechnen:
  // Wir prüfen, was die Intl-API für den naiven Zeitpunkt als Ortszeit ausgibt,
  // und korrigieren iterativ bis die Differenz null ist.
  const candidate = new Date(naiveUtcMs);
  const offset = getUtcOffsetMs(candidate, timezone);

  // Erste Korrektur
  const corrected = new Date(naiveUtcMs - offset);

  // Zweite Korrektur für den Fall, dass die Korrektur selbst eine andere DST-Zone ergibt
  const offset2 = getUtcOffsetMs(corrected, timezone);
  if (offset === offset2) {
    return corrected;
  }
  // Bei DST-Lücke (z. B. Vorwärtsumstellung) bevorzugen wir die zweite Korrektur
  return new Date(naiveUtcMs - offset2);
}

/**
 * Gibt den UTC-Offset in Millisekunden für einen gegebenen Zeitpunkt in der
 * angegebenen Zeitzone zurück. Positiv = Zeitzone liegt vor UTC.
 *
 * Beispiel: Europe/Berlin im Sommer → +7200000 (UTC+2)
 */
function getUtcOffsetMs(date: Date, timezone: string): number {
  // Formatter für Zielzeitzone und UTC
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

  const toMs = (parts: Intl.DateTimeFormatPart[]) => {
    const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
    // Date.UTC gibt UTC-Millisekunden für die angegebenen Werte zurück
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  };

  const localMs = toMs(fmt(timezone).formatToParts(date));
  const utcMs = toMs(fmt('UTC').formatToParts(date));

  return localMs - utcMs;
}
