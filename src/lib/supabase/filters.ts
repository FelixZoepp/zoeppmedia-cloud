/**
 * Helpers gegen PostgREST-Filter-Injection.
 *
 * supabase-js `.or()` nimmt einen String entgegen, in dem Kommas und Klammern
 * Syntax sind. Interpolierter User-Input kann damit zusätzliche Filter-
 * Bedingungen einschleusen. Werte daher immer validieren (UUIDs) oder
 * sanitizen (Freitext), bevor sie in `.or()`-Strings landen.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Entfernt Zeichen mit PostgREST-Filter-Syntax-Bedeutung (`,`, `(`, `)`)
 * aus Freitext-Werten für ilike/eq-Bedingungen in `.or()`-Strings.
 */
export function sanitizeFilterValue(value: string): string {
  return value.replace(/[,()]/g, '');
}
