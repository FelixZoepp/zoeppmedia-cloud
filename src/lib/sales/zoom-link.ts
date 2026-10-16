/** Zoom-Link eines Sales-Termins (Calendly-Ort), nur echte Zoom-Adressen und nicht bei Absage */
export function zoomZiel(e: { location: string | null; status: string | null } | null): string | null {
  if (!e?.location || e.status === 'canceled' || e.status === 'cancelled') return null;
  try {
    const u = new URL(e.location.trim());
    return u.protocol === 'https:' && /(^|\.)zoom\.us$/.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}
