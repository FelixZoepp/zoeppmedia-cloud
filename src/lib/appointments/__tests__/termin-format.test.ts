import { describe, it, expect } from 'vitest';
import {
  angeboteneRunden, belegtePlaetze, formatDerStelle, freiePlaetze, istSchemaFehler, lokaleZeitAlsUtc,
  reminder24hVorlagen, standardAdresse, terminParameter, terminTypFuerFormat, vollstaendigeAdresse,
  type Runde,
} from '../termin-format';
import { TEMPLATE_PRESETS } from '@/lib/whatsapp/template-presets';

const JETZT = new Date('2026-10-16T10:00:00Z');
const h = (stunden: number) => new Date(JETZT.getTime() + stunden * 3600_000).toISOString();

function runde(id: string, startInStunden: number, max = 3): Runde {
  return { id, starts_at: h(startInStunden), ends_at: h(startInStunden + 1), adresse: 'Hauptstraße 5, 20095 Hamburg', hinweis: null, max_teilnehmer: max };
}

describe('Termin-Format', () => {
  it('nimmt das gespeicherte Format, sonst aus appointment_type', () => {
    expect(formatDerStelle({ termin_format: 'vorstellungsrunde', appointment_type: 'onsite' })).toBe('vorstellungsrunde');
    expect(formatDerStelle({ termin_format: null, appointment_type: 'onsite' })).toBe('vor_ort');
    expect(formatDerStelle({ appointment_type: 'video' })).toBe('video');
    expect(formatDerStelle({ termin_format: 'quatsch', appointment_type: 'call' })).toBe('telefon');
    expect(formatDerStelle(null)).toBe('telefon');
  });

  it('bildet das Format auf den Termintyp ab', () => {
    expect(terminTypFuerFormat('telefon')).toBe('call');
    expect(terminTypFuerFormat('video')).toBe('video');
    expect(terminTypFuerFormat('vor_ort')).toBe('onsite');
    expect(terminTypFuerFormat('vorstellungsrunde')).toBe('onsite');
  });

  it('baut die vollständige Adresse mit Hinweis', () => {
    expect(vollstaendigeAdresse('Hauptstraße 5\n20095 Hamburg', 'Klingel Zoepp, 2. OG')).toBe('Hauptstraße 5, 20095 Hamburg (Klingel Zoepp, 2. OG)');
    expect(vollstaendigeAdresse('Hauptstraße 5', '  ')).toBe('Hauptstraße 5');
    expect(vollstaendigeAdresse(null, null)).toBe('');
  });

  it('schlägt Ort der Stelle oder Firmenanschrift als Adresse vor (keine Links)', () => {
    expect(standardAdresse('Büro Hamburg, Hauptstraße 5', 'Anschrift')).toBe('Büro Hamburg, Hauptstraße 5');
    expect(standardAdresse('https://meet.example.com/x', 'Musterweg 1\n12345 Berlin')).toBe('Musterweg 1, 12345 Berlin');
    expect(standardAdresse(null, null)).toBe('');
  });
});

describe('Freie Plätze', () => {
  it('zählt nur gebuchte und bestätigte Termine', () => {
    const belegt = belegtePlaetze([
      { vorstellungsrunde_id: 'a', status: 'booked' },
      { vorstellungsrunde_id: 'a', status: 'confirmed' },
      { vorstellungsrunde_id: 'a', status: 'cancelled' },
      { vorstellungsrunde_id: 'a', status: 'no_show' },
      { vorstellungsrunde_id: null, status: 'booked' },
    ]);
    expect(belegt.get('a')).toBe(2);
    expect(freiePlaetze({ id: 'a', max_teilnehmer: 3 }, belegt)).toBe(1);
    expect(freiePlaetze({ id: 'a', max_teilnehmer: 1 }, belegt)).toBe(0);
    expect(freiePlaetze({ id: 'b', max_teilnehmer: 4 }, belegt)).toBe(4);
  });
});

describe('Angebotene Vorstellungsrunden', () => {
  it('bietet nur anstehende Runden mit freiem Platz an, chronologisch', () => {
    const runden = [runde('spaet', 72), runde('voll', 30, 1), runde('bald', 1), runde('vorbei', -5), runde('frueh', 26)];
    const buchungen = [{ id: 't1', vorstellungsrunde_id: 'voll', status: 'booked' }];
    const ergebnis = angeboteneRunden(runden, buchungen, { jetzt: JETZT });
    expect(ergebnis.map((r) => r.id)).toEqual(['frueh', 'spaet']);
    expect(ergebnis[0].freie_plaetze).toBe(3);
  });

  it('zählt die eigene Buchung beim Verschieben nicht als belegt', () => {
    const buchungen = [{ id: 'eigener', vorstellungsrunde_id: 'voll', status: 'confirmed' }];
    expect(angeboteneRunden([runde('voll', 30, 1)], buchungen, { jetzt: JETZT })).toHaveLength(0);
    expect(angeboteneRunden([runde('voll', 30, 1)], buchungen, { jetzt: JETZT, eigeneTerminId: 'eigener' })).toHaveLength(1);
  });

  it('bietet keine Runden jenseits des Zeitraums an', () => {
    expect(angeboteneRunden([runde('weit', 24 * 90)], [], { jetzt: JETZT })).toHaveLength(0);
  });
});

describe('Nachrichten-Variablen', () => {
  const daten = {
    vorname: 'Mehmet',
    startsAt: new Date('2026-10-20T15:00:00Z'), // 17:00 in Berlin (Sommerzeit)
    timezone: 'Europe/Berlin',
    ort: 'Hauptstraße 5, 20095 Hamburg (Klingel Zoepp, 2. OG)',
    firma: 'Solar Nord GmbH',
  };

  it('Bestätigung: Vorname, Datum, Uhrzeit, vollständige Adresse', () => {
    expect(terminParameter('appointment_confirmation', daten)).toEqual(['Mehmet', '20. Oktober', '17:00', 'Hauptstraße 5, 20095 Hamburg (Klingel Zoepp, 2. OG)']);
  });

  it('24 h mit Adresse: Vorname, Datum, Uhrzeit, Firma, Adresse', () => {
    expect(terminParameter('appointment_reminder_24h_ort', daten)).toEqual(['Mehmet', '20. Oktober', '17:00', 'Solar Nord GmbH', 'Hauptstraße 5, 20095 Hamburg (Klingel Zoepp, 2. OG)']);
  });

  it('24 h ohne Adresse und 2 h mit Ort/Link wie bisher', () => {
    expect(terminParameter('appointment_reminder_24h', daten)).toEqual(['Mehmet', '20. Oktober', '17:00']);
    expect(terminParameter('appointment_reminder_2h', daten)).toEqual(['Mehmet', '17:00', 'Hauptstraße 5, 20095 Hamburg (Klingel Zoepp, 2. OG)']);
    expect(terminParameter('appointment_reminder_2h', { ...daten, ort: null })).toEqual(['Mehmet', '17:00', 'wird noch mitgeteilt']);
  });

  it('Anzahl der Variablen passt zu den Vorlagen', () => {
    for (const key of ['appointment_confirmation', 'appointment_reminder_24h', 'appointment_reminder_24h_ort', 'appointment_reminder_2h']) {
      const preset = TEMPLATE_PRESETS.find((p) => p.presetKey === key)!;
      expect(preset.category).toBe('UTILITY');
      expect(terminParameter(key, daten)).toHaveLength(preset.variables.length);
      expect(preset.beispiel).toHaveLength(preset.variables.length);
    }
  });

  it('wählt für vor Ort mit Adresse zuerst die Erinnerung mit Adresse', () => {
    expect(reminder24hVorlagen({ type: 'onsite', location: 'Hauptstraße 5' })).toEqual(['appointment_reminder_24h_ort', 'appointment_reminder_24h']);
    expect(reminder24hVorlagen({ type: 'onsite', location: null })).toEqual(['appointment_reminder_24h']);
    expect(reminder24hVorlagen({ type: 'call', location: 'x' })).toEqual(['appointment_reminder_24h']);
  });
});

describe('Hilfsfunktionen', () => {
  it('erkennt fehlende Migration', () => {
    expect(istSchemaFehler({ code: '42703', message: 'column jobs.termin_format does not exist' })).toBe(true);
    expect(istSchemaFehler({ code: 'PGRST205', message: "Could not find the table 'public.vorstellungsrunden'" })).toBe(true);
    expect(istSchemaFehler({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(istSchemaFehler(null)).toBe(false);
  });

  it('rechnet lokale Zeit DST-sicher in UTC um', () => {
    expect(lokaleZeitAlsUtc('2026-10-20', '17:00', 'Europe/Berlin')?.toISOString()).toBe('2026-10-20T15:00:00.000Z');
    expect(lokaleZeitAlsUtc('2026-11-10', '17:00', 'Europe/Berlin')?.toISOString()).toBe('2026-11-10T16:00:00.000Z');
    expect(lokaleZeitAlsUtc('2026-10-20', '25:00', 'Europe/Berlin')).toBeNull();
    expect(lokaleZeitAlsUtc('20.10.2026', '17:00', 'Europe/Berlin')).toBeNull();
  });
});
