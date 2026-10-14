/**
 * Telefonieren über die Cloud (Twilio Voice, im Browser).
 * Zugangsdaten nur aus Vercel – nie im Code oder in der Datenbank.
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN   → REST + Webhook-Signatur
 *   TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET → Zugangstoken für den Browser
 *   TWILIO_TWIML_APP_SID                    → TwiML-App, Voice-URL /api/twilio/voice
 *   TWILIO_CALLER_ID (optional)             → Absendernummer, wenn beim Kunden keine eingetragen ist
 */

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
  callerId: string | null;
}

export const TWILIO_VARIABLEN = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_TWIML_APP_SID'] as const;

export function fehlendeTwilioVariablen(env: Record<string, string | undefined> = process.env): string[] {
  return TWILIO_VARIABLEN.filter((k) => !env[k]?.trim());
}

export function twilioConfig(env: Record<string, string | undefined> = process.env): TwilioConfig | null {
  if (fehlendeTwilioVariablen(env).length) return null;
  return {
    accountSid: env.TWILIO_ACCOUNT_SID!.trim(),
    authToken: env.TWILIO_AUTH_TOKEN!.trim(),
    apiKeySid: env.TWILIO_API_KEY_SID!.trim(),
    apiKeySecret: env.TWILIO_API_KEY_SECRET!.trim(),
    twimlAppSid: env.TWILIO_TWIML_APP_SID!.trim(),
    callerId: env.TWILIO_CALLER_ID?.trim() || null,
  };
}

/** Öffentliche Basis-URL, unter der Twilio die Webhooks aufruft (Signatur hängt an der exakten URL) */
export function oeffentlicheBasis(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de').replace(/\/+$/, '');
}
