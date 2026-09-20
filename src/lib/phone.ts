// E.164-Normalisierung, Standardland DE (Spec Abschn. 4: "Telefonnummern immer E.164").
export function normalizePhoneE164(
  input: string | null | undefined,
  defaultCountry: 'DE' = 'DE'
): string | null {
  if (!input) return null;
  let s = input.replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) {
    if (s.startsWith('0')) s = '+49' + s.slice(1);
    else if (s.length >= 7) s = '+49' + s; // defaultCountry DE
    else return null;
  }
  const digits = s.slice(1);
  if (!/^\d{7,15}$/.test(digits)) return null;
  return s;
}
