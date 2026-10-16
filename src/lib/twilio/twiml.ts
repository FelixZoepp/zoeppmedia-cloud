/** TwiML bauen (rein, testbar) */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const ANSAGE_TEXT = 'Hinweis: Dieses Gespräch wird zur Qualitätssicherung aufgezeichnet. Wenn Sie das nicht möchten, sagen Sie es bitte einfach.';

export function twimlAntwort(inhalt = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inhalt}</Response>`;
}

export function twimlSagen(text: string): string {
  return twimlAntwort(`<Say language="de-DE" voice="Polly.Vicki-Neural">${esc(text)}</Say>`);
}

/** Ausgehender Anruf: mit Aufnahme spielt der Angerufene beim Abheben zuerst die Ansage (Number url), dann wird verbunden */
export function twimlWaehlen(x: { nummer: string; callerId: string; basis: string; anrufId: string; aufnahme: boolean }): string {
  const q = `anruf=${encodeURIComponent(x.anrufId)}`;
  const dial = [
    `callerId="${esc(x.callerId)}"`,
    'answerOnBridge="true"',
    'timeout="40"',
    `action="${esc(`${x.basis}/api/twilio/ende?${q}`)}"`,
    x.aufnahme ? 'record="record-from-answer-dual"' : null,
    x.aufnahme ? `recordingStatusCallback="${esc(`${x.basis}/api/twilio/aufnahme?${q}`)}"` : null,
    x.aufnahme ? 'recordingStatusCallbackEvent="completed"' : null,
  ]
    .filter(Boolean)
    .join(' ');
  const number = x.aufnahme ? `<Number url="${esc(`${x.basis}/api/twilio/ansage`)}">${esc(x.nummer)}</Number>` : `<Number>${esc(x.nummer)}</Number>`;
  return twimlAntwort(`<Dial ${dial}>${number}</Dial>`);
}

/**
 * Bestätigungscode per Anruf mithören (Meta liest den Code vor): Spracherkennung, Ergebnis geht an `action`.
 * Es wird nichts angesagt – der Anrufer (Meta) spricht sofort.
 */
export function twimlCodeHoeren(x: { action: string; sprache: 'de-DE' | 'en-US' }): string {
  const hinweise = x.sprache === 'de-DE' ? 'Code, null, eins, zwei, drei, vier, fünf, sechs, sieben, acht, neun' : 'code, zero, one, two, three, four, five, six, seven, eight, nine';
  return twimlAntwort(
    `<Gather input="speech" language="${x.sprache}" speechTimeout="auto" timeout="15" actionOnEmptyResult="true" method="POST" action="${esc(x.action)}" hints="${esc(hinweise)}"></Gather>`,
  );
}

export function twimlAuflegen(): string {
  return twimlAntwort('<Hangup/>');
}

/** Prüfanruf von Twilio (Absender bestätigen): kurz warten, dann den Code als Tastentöne eingeben */
export function twimlCodeEintippen(code: string): string {
  const ziffern = code.replace(/\D/g, '');
  return twimlAntwort(`<Pause length="3"/><Play digits="${esc(ziffern)}"/><Pause length="10"/>`);
}

/** Rückruf auf die Kundennummer an das Handy des Kunden weiterleiten (Bewerber-Nummer wird angezeigt) */
export function twimlWeiterleiten(x: { an: string; anrufer?: string | null }): string {
  const caller = x.anrufer && /^\+\d{6,16}$/.test(x.anrufer) ? ` callerId="${esc(x.anrufer)}"` : '';
  return twimlAntwort(`<Dial timeout="25"${caller}><Number>${esc(x.an)}</Number></Dial>`);
}
