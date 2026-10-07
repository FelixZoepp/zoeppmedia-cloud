/**
 * Wie gut wirken die WhatsApp-Nachrichten der Sales-Nummer? Je Nachrichtenart:
 * gesendet → zugestellt → gelesen → Antwort (48 h) → Klick auf „Termin buchen“ → Termin gebucht (7 Tage).
 * Kunden-Erinnerungen: wie viele erinnerte Aufgaben danach innerhalb von 3 Tagen erledigt wurden.
 */

const STD = 3600e3;
const TAG = 24 * STD;

export const ARTEN: Array<{ key: string; label: string; passt: (preset: string) => boolean }> = [
  { key: 'buchung', label: 'Buchungsbestätigung', passt: (p) => /_buchung/.test(p) },
  { key: 'bestaetigung', label: 'Termin bestätigen (Vortag)', passt: (p) => /bestaetigung/.test(p) },
  { key: 'reminder', label: 'Erinnerung kurz vor Termin', passt: (p) => /reminder/.test(p) },
  { key: 'noshow', label: 'No-Show-Nachfass', passt: (p) => /^noshow/.test(p) },
  { key: 'followup', label: 'Follow-up-Kette', passt: (p) => /^fu_/.test(p) },
  { key: 'kunde', label: 'Kunden-Erinnerung (Aufgaben)', passt: (p) => p === 'kunde_aufgaben_erinnerung' },
];

export interface Ausgehend {
  kontakt: string;
  conversation: string;
  preset: string;
  status: string | null;
  am: string;
}

export interface WirkungZeile {
  key: string;
  label: string;
  gesendet: number;
  zugestellt: number;
  gelesen: number;
  fehlgeschlagen: number;
  antworten: number;
  klicks: number;
  termine: number;
  /** Prozent bezogen auf gesendet (ohne Fehlgeschlagene) */
  leseQuote: number | null;
  antwortQuote: number | null;
  terminQuote: number | null;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

export function berechneWirkung(input: {
  ausgehend: Ausgehend[];
  eingehend: Array<{ conversation: string; am: string }>;
  klicks: Array<{ kontakt: string; source: string; am: string }>;
  buchungen: Array<{ kontakt: string; am: string }>;
}): WirkungZeile[] {
  const zeilen: WirkungZeile[] = [];
  for (const art of ARTEN) {
    const msgs = input.ausgehend.filter((m) => art.passt(m.preset));
    if (!msgs.length) continue;
    const ok = msgs.filter((m) => m.status !== 'failed');
    let antworten = 0;
    let klicks = 0;
    let termine = 0;
    for (const m of ok) {
      const t = new Date(m.am).getTime();
      if (input.eingehend.some((e) => e.conversation === m.conversation && new Date(e.am).getTime() > t && new Date(e.am).getTime() <= t + 48 * STD)) antworten++;
      if (input.klicks.some((k) => k.kontakt === m.kontakt && k.source === m.preset && new Date(k.am).getTime() >= t && new Date(k.am).getTime() <= t + 7 * TAG)) klicks++;
      // Buchungsbestätigungen folgen auf eine Buchung – dort zählt kein „Termin danach“
      if (art.key !== 'buchung' && input.buchungen.some((b) => b.kontakt === m.kontakt && new Date(b.am).getTime() > t && new Date(b.am).getTime() <= t + 7 * TAG)) termine++;
    }
    const zugestellt = ok.filter((m) => m.status === 'delivered' || m.status === 'read').length;
    const gelesen = ok.filter((m) => m.status === 'read').length;
    zeilen.push({
      key: art.key,
      label: art.label,
      gesendet: msgs.length,
      zugestellt,
      gelesen,
      fehlgeschlagen: msgs.length - ok.length,
      antworten,
      klicks,
      termine,
      leseQuote: pct(gelesen, ok.length),
      antwortQuote: pct(antworten, ok.length),
      terminQuote: art.key === 'buchung' ? null : pct(termine, ok.length),
    });
  }
  return zeilen;
}

/** Kunden-Erinnerungen: erinnerte Aufgaben, die danach binnen 3 Tagen erledigt wurden */
export function erinnerungsWirkung(steps: Array<{ kunde_erinnert_am: string | null; erledigt_am: string | null }>): { erinnert: number; erledigt3: number; quote: number | null } {
  const erinnert = steps.filter((s) => s.kunde_erinnert_am);
  const erledigt3 = erinnert.filter((s) => {
    if (!s.erledigt_am) return false;
    const d = new Date(s.erledigt_am).getTime() - new Date(s.kunde_erinnert_am!).getTime();
    return d >= 0 && d <= 3 * TAG;
  }).length;
  return { erinnert: erinnert.length, erledigt3, quote: pct(erledigt3, erinnert.length) };
}
