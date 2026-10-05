/** Nur Bilder aus unserem eigenen Storage-Bucket zulassen */
export function isOwnStorageUrl(url: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''): boolean {
  if (!supabaseUrl) return false;
  return url.startsWith(`${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/onboarding-assets/`);
}

/** Logo aus agencies.settings lesen */
export function agencyLogo(settings: unknown): string | null {
  const v = (settings as { logo_url?: unknown } | null)?.logo_url;
  return typeof v === 'string' && v ? v : null;
}
