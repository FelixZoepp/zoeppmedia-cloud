/** Hilfen rund um WhatsApp-Vorlagen: Platzhalter zählen, Text anzeigen, Meta-Fehler verständlich machen. */

/** Höchster Platzhalter im Vorlagentext ({{1}}, {{2}} …) = Anzahl der Werte, die Meta erwartet */
export function placeholderCount(body: string | null | undefined): number {
  let max = 0;
  for (const m of (body ?? '').matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/** Variablen-Objekt {"1": "Max", "2": "…"} → Liste in Platzhalter-Reihenfolge */
export function orderedParams(vars: Record<string, string>, count: number): string[] {
  return Array.from({ length: count }, (_, i) => (vars[String(i + 1)] ?? '').trim());
}

/** Gespeicherter Text einer Vorlagen-Nachricht → lesbarer Text (alte Nachrichten haben nur den Vorlagennamen) */
export function displayTemplateBody(body: string | null, templateBodyByName: Map<string, string>): string | null {
  if (!body) return body;
  const nurName = /^[a-z0-9_]+$/.test(body.trim()) ? templateBodyByName.get(body.trim()) : undefined;
  const text = nurName ?? body;
  // Unbekannte Werte nicht als {{1}} zeigen
  return text.replace(/\{\{\d+\}\}/g, '…');
}

const META_FEHLER: Array<[RegExp, string]> = [
  [/132000|number of parameters/i, 'Anzahl der Platzhalter passt nicht zur Vorlage – bitte alle Felder ausfüllen.'],
  [/132001|template.*(does not exist|not found)/i, 'Diese Vorlage gibt es bei Meta nicht (mehr) in dieser Sprache.'],
  [/132015|paused/i, 'Die Vorlage ist bei Meta pausiert (zu viele negative Rückmeldungen).'],
  [/132016|disabled/i, 'Die Vorlage wurde von Meta deaktiviert.'],
  [/131047|re-engagement|24 hours/i, 'Das 24-Stunden-Fenster ist abgelaufen – bitte eine Vorlage senden.'],
  [/131026|undeliverable|not a whatsapp/i, 'Nachricht nicht zustellbar – die Nummer nutzt vermutlich kein WhatsApp.'],
  [/131056|pair rate limit/i, 'Zu viele Nachrichten an diese Nummer in kurzer Zeit – bitte später erneut senden.'],
  [/130429|rate limit/i, 'WhatsApp-Limit erreicht – bitte gleich noch einmal versuchen.'],
  [/131049|ecosystem engagement/i, 'Meta hat die Nachricht zurückgehalten, um den Empfänger nicht zu überladen.'],
  [/190|access token|OAuthException.*token/i, 'Die WhatsApp-Verbindung ist abgelaufen – bitte unter Einstellungen → WhatsApp neu verbinden.'],
  [/131030|not in allowed list/i, 'Testnummer: Empfänger ist nicht in der erlaubten Liste.'],
];

/** Roher Fehler (oft JSON von Meta) → kurzer deutscher Satz */
export function friendlyWhatsAppError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const [re, text] of META_FEHLER) if (re.test(raw)) return text;
  const msg = raw.match(/"message"\s*:\s*"([^"]+)"/)?.[1];
  if (msg) return `WhatsApp: ${msg}`;
  // Eigene, bereits verständliche Fehlertexte unverändert lassen
  return raw.length <= 200 && !raw.includes('{') ? raw : 'Nachricht konnte nicht gesendet werden.';
}
