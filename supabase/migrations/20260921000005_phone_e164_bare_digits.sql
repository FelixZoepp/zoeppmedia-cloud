-- Konsistenz mit src/lib/phone.ts: nackte Ziffernfolgen (ohne 0/00/+) als nationale Nummer mit +49 normalisieren.
UPDATE candidates
SET phone_e164 = '+49' || regexp_replace(phone, '[^0-9]', '', 'g')
WHERE phone_e164 IS NULL
  AND phone IS NOT NULL AND phone <> ''
  AND regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[1-9][0-9]{6,12}$';
