/**
 * Wochenbericht für Kunden: Ist der Kunde auf Kurs?
 *
 * - Aufbau (Zahlung/Onboarding/Setup): Fortschritt bis zum Kampagnenstart, offene Kunden-Aufgaben.
 * - Kampagne läuft (Continuity): Bewerber, Kontakt, Tempo, Gespräche, Einstellungen der letzten 7 Tage.
 *
 * Status: auf_kurs (alles grün) · achtung (mind. ein gelber Punkt) · kritisch (mind. ein roter Punkt).
 * Rein (keine I/O) – Laden in laden.ts.
 */

export type BerichtStatus = 'auf_kurs' | 'achtung' | 'kritisch';
export type PunktStufe = 'ok' | 'gelb' | 'rot';

export interface Punkt {
  stufe: PunktStufe;
  text: string;
}

export interface Kennzahl {
  label: string;
  wert: string;
  /** Vergleich zur Vorwoche, z. B. „+3“ – null, wenn nicht sinnvoll */
  vorwoche: string | null;
}

export interface WochenberichtEingabe {
  firma: string;
  vorname: string;
  phase: string | null;
  /** wir bearbeiten die Bewerber (Baustein Innendienst) */
  wirBearbeiten: boolean;
  /** Woche: [von, bis) – bis = Berichtszeitpunkt */
  jetzt: Date;
  kandidaten: Array<{ created_at: string; first_contact_at: string | null; kontaktversuch_am: string | null; ttfc_seconds: number | null; eingang: boolean }>;
  anrufe: Array<{ created_at: string; erreicht: boolean }>;
  /** vergangene Termine (Vorstellungsgespräche) */
  termine: Array<{ datum: string; status: string | null }>;
  einstellungen: string[];
  geplant: { gespraeche: number; probetage: number };
  kundenAufgaben: Array<{ titel: string; faellig_am: string | null }>;
  wirErledigt: string[];
  wirAlsNaechstes: string[];
  fortschritt: { erledigt: number; gesamt: number } | null;
  umsaetzeFehlen: boolean;
  empfehlung: { titel: string; warum: string } | null;
}

export interface Wochenbericht {
  kw: number;
  jahr: number;
  zeitraum: string;
  firma: string;
  vorname: string;
  modus: 'aufbau' | 'kampagne';
  status: BerichtStatus;
  ueberschrift: string;
  kennzahlen: Kennzahl[];
  punkte: Punkt[];
  deineAufgaben: string[];
  wirErledigt: string[];
  wirAlsNaechstes: string[];
  empfehlung: { titel: string; warum: string } | null;
}

const TAG = 864e5;

export function isoWoche(d: Date): { kw: number; jahr: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const tag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - tag);
  const jahrStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { kw: Math.ceil(((t.getTime() - jahrStart.getTime()) / TAG + 1) / 7), jahr: t.getUTCFullYear() };
}

const datum = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });
const diff = (a: number, b: number) => (a > b ? `+${a - b}` : a < b ? `${a - b}` : '±0');
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

function dauer(min: number): string {
  if (min < 60) return `${min} Min.`;
  const h = Math.round(min / 6) / 10;
  return h < 24 ? `${String(h).replace('.', ',')} Std.` : `${Math.round(h / 24)} Tage`;
}

export function berechneWochenbericht(e: WochenberichtEingabe): Wochenbericht {
  const bis = e.jetzt.getTime();
  const von = bis - 7 * TAG;
  const vorVon = bis - 14 * TAG;
  const inWoche = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= von && t < bis;
  };
  const inVorwoche = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= vorVon && t < von;
  };
  const { kw, jahr } = isoWoche(new Date(bis - TAG));
  const zeitraum = `${datum(new Date(von))} – ${datum(new Date(bis - TAG))}`;
  const heute = e.jetzt.toISOString().slice(0, 10);

  const punkte: Punkt[] = [];
  const add = (stufe: PunktStufe, text: string) => punkte.push({ stufe, text });

  // Kunden-Aufgaben: überfällige sind immer ein Thema
  const ueberfaellig = e.kundenAufgaben.filter((a) => a.faellig_am && a.faellig_am < heute);
  const deineAufgaben = e.kundenAufgaben.map((a) => (a.faellig_am && a.faellig_am < heute ? `${a.titel} (überfällig)` : a.titel));

  const aufbau = e.phase !== 'continuity';
  const kennzahlen: Kennzahl[] = [];

  if (aufbau) {
    if (e.fortschritt && e.fortschritt.gesamt > 0) {
      const p = Math.round((e.fortschritt.erledigt / e.fortschritt.gesamt) * 100);
      kennzahlen.push({ label: 'Fortschritt bis zum Start', wert: `${p} %`, vorwoche: null });
    }
    kennzahlen.push({ label: 'Diese Woche von uns erledigt', wert: String(e.wirErledigt.length), vorwoche: null });
    kennzahlen.push({ label: 'Deine offenen Aufgaben', wert: String(e.kundenAufgaben.length), vorwoche: null });
    if (ueberfaellig.length) add(ueberfaellig.length >= 3 ? 'rot' : 'gelb', `${ueberfaellig.length} deiner Aufgaben ${ueberfaellig.length === 1 ? 'ist' : 'sind'} überfällig – damit verschiebt sich der Start.`);
    else if (e.kundenAufgaben.length) add('ok', 'Deine Aufgaben sind im Zeitplan.');
    else add('ok', 'Von deiner Seite ist alles erledigt – jetzt sind wir dran.');
  } else {
    const neu = e.kandidaten.filter((k) => inWoche(k.created_at));
    const neuVor = e.kandidaten.filter((k) => inVorwoche(k.created_at)).length;
    const kontaktiert = neu.filter((k) => k.first_contact_at || k.kontaktversuch_am).length;
    const quote = pct(kontaktiert, neu.length);
    const ttfc = neu.map((k) => k.ttfc_seconds).filter((s): s is number => typeof s === 'number' && s >= 0);
    const tempo = ttfc.length ? Math.round(ttfc.sort((a, b) => a - b)[Math.floor(ttfc.length / 2)] / 60) : null;
    const liegen = e.kandidaten.filter((k) => k.eingang && !k.first_contact_at && !k.kontaktversuch_am && new Date(k.created_at).getTime() < bis - 2 * TAG).length;
    const anrufe = e.anrufe.filter((a) => inWoche(a.created_at));
    const anrufeVor = e.anrufe.filter((a) => inVorwoche(a.created_at)).length;
    const erreicht = pct(anrufe.filter((a) => a.erreicht).length, anrufe.length);
    const termine = e.termine.filter((t) => inWoche(t.datum) && t.status !== 'abgesagt' && t.status !== 'cancelled');
    const termineVor = e.termine.filter((t) => inVorwoche(t.datum) && t.status !== 'abgesagt' && t.status !== 'cancelled').length;
    const noShows = termine.filter((t) => t.status === 'no_show').length;
    const einst = e.einstellungen.filter(inWoche).length;
    const einstVor = e.einstellungen.filter(inVorwoche).length;

    kennzahlen.push(
      { label: 'Neue Bewerber', wert: String(neu.length), vorwoche: diff(neu.length, neuVor) },
      { label: 'Kontaktiert', wert: quote === null ? '–' : `${quote} %`, vorwoche: null },
      { label: 'Ø Zeit bis zum ersten Kontakt', wert: tempo === null ? '–' : dauer(tempo), vorwoche: null },
      { label: 'Anrufe', wert: String(anrufe.length), vorwoche: diff(anrufe.length, anrufeVor) },
      { label: 'Vorstellungsgespräche', wert: String(termine.length), vorwoche: diff(termine.length, termineVor) },
      { label: 'Einstellungen', wert: String(einst), vorwoche: diff(einst, einstVor) },
    );
    if (erreicht !== null) kennzahlen.splice(4, 0, { label: 'Erreicht', wert: `${erreicht} %`, vorwoche: null });
    if (e.geplant.gespraeche || e.geplant.probetage) {
      kennzahlen.push({ label: 'Anstehend', wert: `${e.geplant.gespraeche} ${e.geplant.gespraeche === 1 ? 'Gespräch' : 'Gespräche'} · ${e.geplant.probetage} ${e.geplant.probetage === 1 ? 'Probetag' : 'Probetage'}`, vorwoche: null });
    }

    const wir = e.wirBearbeiten;
    // 1. Kommen Bewerber rein? (unsere Verantwortung)
    if (neu.length === 0) add('rot', 'Diese Woche sind keine neuen Bewerber eingegangen – wir prüfen die Kampagne und melden uns.');
    else if (neuVor >= 5 && neu.length < neuVor * 0.5) add('gelb', `Weniger Bewerber als in der Vorwoche (${neu.length} statt ${neuVor}) – wir optimieren die Anzeigen.`);
    else add('ok', `${neu.length} neue Bewerber${neuVor ? ` (Vorwoche ${neuVor})` : ''}.`);

    // 2. Werden sie kontaktiert?
    if (neu.length >= 3 && quote !== null) {
      if (quote < 50) add('rot', wir ? `Erst ${quote} % der neuen Bewerber kontaktiert – unser Innendienst holt das sofort nach.` : `Erst ${quote} % der neuen Bewerber kontaktiert. Jeder nicht angerufene Bewerber ist verlorenes Geld.`);
      else if (quote < 80) add('gelb', wir ? `${quote} % der neuen Bewerber kontaktiert – Ziel sind 100 %.` : `${quote} % der neuen Bewerber kontaktiert – Ziel sind 100 %.`);
      else add('ok', `${quote} % der neuen Bewerber kontaktiert.`);
    }
    // 3. Liegen Bewerber herum?
    if (liegen > 10) add('rot', `${liegen} Bewerber warten seit über 2 Tagen auf den ersten Anruf.`);
    else if (liegen > 0) add('gelb', `${liegen} ${liegen === 1 ? 'Bewerber wartet' : 'Bewerber warten'} seit über 2 Tagen auf den ersten Anruf.`);
    // 4. Tempo
    if (tempo !== null) {
      if (tempo <= 60) add('ok', `Erster Kontakt im Schnitt nach ${dauer(tempo)} – stark.`);
      else add('gelb', `Erster Kontakt im Schnitt erst nach ${dauer(tempo)}. Unter 1 Stunde verdoppelt sich die Erreichbarkeit.`);
    }
    // 5. Gespräche
    if (neu.length >= 5 && termine.length === 0) add('gelb', 'Viele Bewerber, aber keine Vorstellungsgespräche – lass uns die Terminierung anschauen.');
    if (termine.length >= 3 && noShows / termine.length > 0.3) add('gelb', `${noShows} von ${termine.length} Gesprächen sind ausgefallen (No-Show). Eine Bestätigung am Vortag hilft.`);
    // 6. Aufgaben + Umsätze
    if (ueberfaellig.length) add('gelb', `${ueberfaellig.length} ${ueberfaellig.length === 1 ? 'Aufgabe ist' : 'Aufgaben sind'} bei dir überfällig.`);
    if (e.umsaetzeFehlen) add('gelb', 'Die Umsätze deiner neuen Vertriebler fehlen noch – bitte unter „Umsätze“ eintragen, damit wir deinen ROI zeigen können.');
  }

  const status: BerichtStatus = punkte.some((p) => p.stufe === 'rot') ? 'kritisch' : punkte.some((p) => p.stufe === 'gelb') ? 'achtung' : 'auf_kurs';
  const offen = punkte.filter((p) => p.stufe !== 'ok').length;
  const ueberschrift =
    status === 'auf_kurs'
      ? aufbau
        ? 'Alles im Plan – der Start rückt näher'
        : 'Du bist auf Kurs'
      : status === 'achtung'
        ? `Auf Kurs, aber ${offen} ${offen === 1 ? 'Punkt braucht' : 'Punkte brauchen'} Aufmerksamkeit`
        : 'Hier müssen wir gegensteuern';

  return {
    kw,
    jahr,
    zeitraum,
    firma: e.firma,
    vorname: e.vorname,
    modus: aufbau ? 'aufbau' : 'kampagne',
    status,
    ueberschrift,
    kennzahlen,
    // Wichtiges zuerst
    punkte: [...punkte].sort((a, b) => rang(a.stufe) - rang(b.stufe)),
    deineAufgaben,
    wirErledigt: e.wirErledigt,
    wirAlsNaechstes: e.wirAlsNaechstes,
    empfehlung: status === 'kritisch' ? null : e.empfehlung,
  };
}

function rang(s: PunktStufe): number {
  return s === 'rot' ? 0 : s === 'gelb' ? 1 : 2;
}
