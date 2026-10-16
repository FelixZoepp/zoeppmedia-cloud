/**
 * Funnel-Angaben der Bewerber (Perspective) als „Frage → Antwort“ – landen in candidates.vorquali_json
 * und erscheinen beim Bewerber unter „Vorqualifizierung“. Kontaktfelder, Tracking (UTM, fbclid, ps_*)
 * und die Datenschutz-Checkbox werden weggelassen.
 */

const KONTAKT = new Set(['name', 'firstname', 'lastname', 'email', 'phone']);
const TECHNIK = /^(utm_|ps_|fbclid|gclid|ttclid|msclkid|status$)/i;
const DATENSCHUTZ = /datenschutz|einwilligung|akzeptiere|agb/i;

function wertText(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nein';
  if (Array.isArray(v)) return v.map(wertText).filter(Boolean).join(', ') || null;
  return null;
}

function eintragen(out: Record<string, string>, frage: string, antwort: string | null) {
  if (!antwort || DATENSCHUTZ.test(frage)) return;
  const f = frage.trim().replace(/\s+/g, ' ').slice(0, 200);
  // Gleiche Frage mehrfach (z. B. je Funnel-Zweig) → Antworten zusammenführen
  out[f] = out[f] && out[f] !== antwort ? `${out[f]}, ${antwort}` : antwort;
}

/** Webhook: profile = { feld: { value, title } | string } (rein, testbar) */
export function angabenAusProfil(profile: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, feld] of Object.entries(profile ?? {})) {
    if (KONTAKT.has(key.toLowerCase()) || TECHNIK.test(key)) continue;
    const o = feld && typeof feld === 'object' && !Array.isArray(feld) ? (feld as { value?: unknown; title?: unknown }) : { value: feld };
    const titel = typeof o.title === 'string' && o.title.trim() ? o.title : null;
    if (!titel) continue; // ohne Fragetext nicht verständlich
    eintragen(out, titel, wertText(o.value));
  }
  return out;
}

/** Abgleich/Nachtragen: properties des Kontakts + Felder-Schema des Funnels (fieldName → title) (rein, testbar) */
export function angabenAusKontakt(properties: Record<string, unknown> | null | undefined, schema: Array<{ fieldName: string; title: string }>): Record<string, string> {
  const titel = new Map(schema.map((f) => [f.fieldName, f.title]));
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(properties ?? {})) {
    if (KONTAKT.has(key.toLowerCase()) || TECHNIK.test(key)) continue;
    const t = titel.get(key);
    if (!t) continue;
    eintragen(out, t, wertText(v));
  }
  return out;
}
