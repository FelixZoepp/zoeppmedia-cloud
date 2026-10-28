import type { Instrumentation } from 'next';

/**
 * Serverfehler (Seiten, API-Routen, Server Actions) gedrosselt nach Slack melden – damit Ausfälle auffallen,
 * bevor Kunden anrufen. Gleicher Fehler auf derselben Route höchstens alle 2 Stunden.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.VERCEL_ENV !== 'production') return;
  try {
    const message = err instanceof Error ? err.message : String(err);
    const digest = typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : '';
    // Abgebrochene Verbindungen und Weiterleitungen sind keine Fehler
    if (/NEXT_REDIRECT|NEXT_NOT_FOUND|aborted|ECONNRESET/i.test(message)) return;
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { meldeAlarm } = await import('@/lib/ops/slack-alarm');
    const route = context.routePath || request.path.split('?')[0];
    await meldeAlarm(createAdminClient(), {
      schluessel: `fehler:${route}:${message.slice(0, 80)}`,
      titel: `Serverfehler auf ${route}`,
      text: `${request.method} ${request.path.split('?')[0]} (${context.routeType})\n${message.slice(0, 500)}${digest ? `\nDigest: ${digest}` : ''}`,
      schwere: 'warnung',
    });
  } catch {
    /* Fehlermeldung darf nie selbst einen Fehler werfen */
  }
};
