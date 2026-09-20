// E.164-Normalisierung, Standardland DE (Spec Abschn. 4: "Telefonnummern immer E.164").
export function normalizePhoneE164(
  input: string | null | undefined,
  defaultCountry: 'DE' = 'DE'
): string | null {
  const prefixes = { DE: '+49' } as const;
  const prefix = prefixes[defaultCountry];

  if (!input) return null;
  let s = input.replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) {
    if (s.startsWith('0')) s = prefix + s.slice(1);
    else if (s.length >= 7) s = prefix + s;
    else return null;
  }
  const digits = s.slice(1);
  if (!/^\d{7,15}$/.test(digits)) return null;
  return s;
}
