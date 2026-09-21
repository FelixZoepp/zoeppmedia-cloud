/**
 * Tenant-Doktrin-Test (statisch)
 *
 * Scannt rekursiv alle .ts-Dateien unter src/app/api und src/lib/workers.
 * Jede Datei, die eine der geschützten Tabellen abfragt (candidates, applications,
 * messages, conversations, jobs), MUSS einen der bekannten Scoping-Marker enthalten:
 *   - 'agency_id'
 *   - 'wa_account_id'  (whatsapp-spezifisches Scoping)
 *   - 'candidate_id'   (notes-artiges Scoping, wo der Kandidat zuvor agency-verifiziert wurde)
 *
 * Begründete Ausnahmen werden in WHITELIST gepflegt — jede mit Kommentar.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

const PROTECTED_TABLES = [
  'candidates',
  'applications',
  'messages',
  'conversations',
  'jobs',
];

const SCOPING_MARKERS = [
  'agency_id',
  'wa_account_id',
  'candidate_id',
];

// Muster, das einen .from()-Aufruf auf einer geschützten Tabelle erkennt
// z.B. .from('candidates') oder .from("jobs")
const FROM_PATTERN = new RegExp(
  `\\.from\\(['"](${PROTECTED_TABLES.join('|')})['"]\\)`
);

// ---------------------------------------------------------------------------
// Whitelist: begründete Ausnahmen (relative Pfade ab src/)
// ---------------------------------------------------------------------------

const WHITELIST: Record<string, string> = {
  // Admin-only cross-tenant routes (geschützt durch isInternalUser-Check).
  // Diese Routes aggregieren absichtlich über alle Agenturen hinweg —
  // sie sind ausschließlich für interne Nutzer (admin/employee) zugänglich.
  'app/api/admin/ttfc/route.ts':
    'Admin-Route (isInternalUser); .from(candidates) liefert agency-übergreifende TTFC-Statistik — kein Datenleck, da nur für interne Nutzer zugänglich.',
  'app/api/admin/agencies/route.ts':
    'Admin-Route (isInternalUser); .from(candidates) zählt Kandidaten je Agentur für das Admin-Dashboard — kein Datenleck, da nur für interne Nutzer zugänglich.',
  // Admin-only global search
  'app/api/search/route.ts':
    'Admin-Route (isInternal); .from(candidates) ist eine globale Suche für interne Nutzer — kein Datenleck, da der Zugang durch isInternal-Prüfung geschützt ist.',
  // tasks/today: Die zweite candidates-Abfrage (Zeile ~130) schlägt nach candidate_id nach,
  // die zuvor aus einer agency-gefilterten callbacks-Query stammen.
  // candidate_id ist als Scoping-Marker anerkannt UND taucht in derselben Datei auf.
  // Der statische Scan erkennt agency_id in derselben Datei (bedingte Filterung),
  // daher ist diese Datei eigentlich nicht verletzend — Whitelist nur zur Dokumentation.

  // Öffentliche Indeed-Screening-Fragen-Route: Suche job by UUID (PK) und gibt ausschließlich
  // statische Fragen zurück (kein Tenant-Datum). Kein agency_id-Filter nötig, weil:
  // 1. Rückgabe enthält ausschließlich vordefinierte Fragen (kein Datenleck).
  // 2. Die Existenzprüfung (active + indeed_mode) über UUID-PK ist kein Datenleck
  //    (UUID ist unratebar; Indeed kennt die job-UUID durch den Feed-Export).
  'app/api/indeed/questions/[job_id]/route.ts':
    'Öffentliche Route für Indeed Apply Screening-Fragen; gibt nur statische Fragen zurück (kein Tenant-Datum). Job-Lookup via UUID-PK ohne agency_id ist kein Datenleck, da UUID unratebar und die Rückgabe keinerlei Kundendaten enthält.',
};

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe('Tenant-Doktrin: Service-Role-Queries müssen agency-scoped sein', () => {
  it('Alle API- und Worker-Dateien mit geschützten Tabellen tragen Scoping-Marker', () => {
    const root = process.cwd();
    const srcDir = path.join(root, 'src');
    const scanDirs = [
      path.join(srcDir, 'app', 'api'),
      path.join(srcDir, 'lib', 'workers'),
    ];

    const files = scanDirs.flatMap(collectTsFiles);

    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      // Prüfen ob die Datei überhaupt eine geschützte Tabelle abfragt
      if (!FROM_PATTERN.test(content)) continue;

      // Relativer Pfad ab src/ für Whitelist-Lookup
      const relPath = path.relative(srcDir, file);

      if (WHITELIST[relPath] !== undefined) continue;

      // Mindestens einen Scoping-Marker erfordern
      const hasMarker = SCOPING_MARKERS.some(marker => content.includes(marker));

      if (!hasMarker) {
        violations.push(relPath);
      }
    }

    if (violations.length > 0) {
      const list = violations.map(v => `  - ${v}`).join('\n');
      expect.fail(
        `Tenant-Doktrin-Verletzung: folgende Dateien fragen geschützte Tabellen ab,\n` +
        `enthalten aber keinen Scoping-Marker (agency_id / wa_account_id / candidate_id):\n${list}\n\n` +
        `Entweder die Query mit .eq('agency_id', …) absichern ODER — nach Prüfung — in\n` +
        `WHITELIST in tenant-doctrine.test.ts eintragen (mit Begründungskommentar).`
      );
    }

    // Sicherstellen, dass mindestens Dateien gescannt wurden
    expect(files.length).toBeGreaterThan(0);
  });
});
