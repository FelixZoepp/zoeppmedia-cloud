/**
 * Nur Bilder aus unserem eigenen Storage-Bucket zulassen. Vergleicht Host und Pfad statt des
 * exakten Strings – robust gegen Leerzeichen/Zeilenumbrüche oder Schrägstriche in der Env-Variable.
 */
export function isOwnStorageUrl(url: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''): boolean {
  try {
    const base = new URL(supabaseUrl.trim());
    const u = new URL(url.trim());
    return (
      u.protocol === 'https:' &&
      u.host === base.host &&
      u.pathname.startsWith('/storage/v1/object/public/onboarding-assets/') &&
      !u.pathname.includes('..')
    );
  } catch {
    return false;
  }
}

/** Logo aus agencies.settings lesen */
export function agencyLogo(settings: unknown): string | null {
  const v = (settings as { logo_url?: unknown } | null)?.logo_url;
  return typeof v === 'string' && v ? v : null;
}
