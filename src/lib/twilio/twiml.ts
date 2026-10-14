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
