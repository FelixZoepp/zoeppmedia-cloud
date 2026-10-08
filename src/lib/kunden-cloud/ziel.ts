/** Nur Pfade auf der eigenen Domain zulassen (fängt auch /\evil.com und //evil.com ab). */
export function sicheresZiel(ziel: string | null, basis: string): URL {
  const fallback = new URL('/candidates', basis);
  if (!ziel || !ziel.startsWith('/')) return fallback;
  try {
    const url = new URL(ziel, basis);
    return url.origin === fallback.origin ? url : fallback;
  } catch {
    return fallback;
  }
}
