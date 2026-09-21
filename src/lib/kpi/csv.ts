/**
 * CSV-Hilfsfunktionen für den Job-Statistik-Export.
 *
 * Trennzeichen: Semikolon (deutsches Excel)
 * Encoding:     UTF-8 mit BOM (Excel erkennt Umlaute korrekt)
 * Zeilenenden:  CRLF (\r\n)
 * Escaping:     Felder mit Semikolon, Anführungszeichen oder Zeilenumbruch
 *               werden in doppelte Anführungszeichen eingeschlossen;
 *               enthaltene Anführungszeichen werden verdoppelt ("" statt \").
 */

const DELIMITER = ';';
const CRLF = '\r\n';
const BOM = '\uFEFF';

/**
 * Wandelt einen einzelnen Zellwert in einen CSV-sicheren String um.
 * null → leerer String
 * number → toString()
 * string → bei Bedarf quoted und escaped
 */
function escapeField(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);

  // Quoting notwendig bei Semikolon, Anführungszeichen oder Zeilenumbrüchen
  const needsQuoting = str.includes(DELIMITER) || str.includes('"') || str.includes('\n') || str.includes('\r');
  if (!needsQuoting) return str;

  // Anführungszeichen verdoppeln, dann gesamtes Feld in Anführungszeichen
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Formatiert eine Dezimalzahl (0–1) als deutsches Prozentformat.
 * Beispiel: 0.75 → "75,0 %"
 * null → leerer String
 */
export function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return '';
  const percent = value * 100;
  // Eine Nachkommastelle, Dezimaltrennzeichen Komma
  const formatted = percent.toFixed(1).replace('.', ',');
  return `${formatted} %`;
}

/**
 * Baut einen vollständigen CSV-String aus Header-Zeile und Datenzeilen.
 *
 * @param headers - Spaltenüberschriften
 * @param rows    - Datenzeilen; jeder Wert ist string | number | null
 * @returns       - UTF-8-BOM-präfixierter CSV-String mit CRLF-Zeilenenden
 */
export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null>>,
): string {
  const lines: string[] = [];

  // Header-Zeile
  lines.push(headers.map(escapeField).join(DELIMITER));

  // Datenzeilen
  for (const row of rows) {
    lines.push(row.map(escapeField).join(DELIMITER));
  }

  return BOM + lines.join(CRLF) + CRLF;
}
