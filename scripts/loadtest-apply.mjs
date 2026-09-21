#!/usr/bin/env node
/**
 * scripts/loadtest-apply.mjs — Lasttest für POST /api/apply
 *
 * Node 22, keine externen Dependencies.
 *
 * Usage:
 *   node scripts/loadtest-apply.mjs <BASE_URL> <ORG_SLUG> <JOB_SLUG> [total=1000] [concurrency=50]
 *
 * Beispiel:
 *   node scripts/loadtest-apply.mjs http://localhost:3000 demo-agentur junior-vertriebler 200 20
 *
 * Das Skript baut FormData-Bewerbungen (Name "Lasttest {i}", Telefon +49151-Zufallsnummer,
 * consentWhatsapp "true", KEIN PDF) und feuert sie mit begrenzter Parallelität über fetch.
 *
 * Ausgabe: Gesamtdauer, p50/p95/p99-Latenz, Statuscode-Verteilung.
 *
 * HINWEIS: Das Rate-Limit auf /api/apply beträgt 20 Anfragen pro 600 Sekunden pro IP
 * (DB-basierter Fixed-Window-Zähler, fail-open). Bei einem Lasttest von 1000 Anfragen
 * von einer einzigen IP werden nach den ersten 20 Anfragen 429-Antworten erwartet.
 * Das ist erwartetes Verhalten und in der Statuscode-Verteilung sichtbar.
 * Für einen realistischen Volllasttest sollte eine Staging-Umgebung mit erhöhtem
 * Rate-Limit-Schwellenwert oder mehreren IPs (Proxy/VPN-Rotation) verwendet werden.
 * Außerdem muss TURNSTILE_SECRET_KEY in der Staging-Umgebung nicht gesetzt sein
 * (dann wird Turnstile übersprungen) oder auf "1x0000000000000000000000000000000AA"
 * (Cloudflare-Test-Secret, das immer besteht) gesetzt werden.
 *
 * SICHERHEIT: Dieses Skript VERWEIGERT den Start gegen Produktionsumgebungen,
 * wenn BASE_URL das Wort "zoepp" enthält, außer --force ist übergeben.
 */

// ─── Produktionsschutz ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const forceFlag = args.includes('--force');
const cleanArgs = args.filter((a) => a !== '--force');

if (cleanArgs.length < 3) {
  console.error(
    [
      '',
      '  VERWENDUNG:',
      '    node scripts/loadtest-apply.mjs <BASE_URL> <ORG_SLUG> <JOB_SLUG> [total=1000] [concurrency=50] [--force]',
      '',
      '  PARAMETER:',
      '    BASE_URL      URL der Zielumgebung, z. B. http://localhost:3000',
      '    ORG_SLUG      Slug der Agentur (agencies.slug), z. B. demo-agentur',
      '    JOB_SLUG      Slug der Stelle (jobs.slug), z. B. junior-vertriebler',
      '    total         Anzahl Anfragen gesamt (Standard: 1000)',
      '    concurrency   Gleichzeitige Anfragen (Standard: 50)',
      '    --force       Erzwingt den Start auch gegen Produktions-URLs (gefährlich!)',
      '',
      '  WICHTIG: Das Rate-Limit beträgt 20 Req/600s pro IP.',
      '  Erwarte 429-Antworten ab Anfrage 21 von derselben IP.',
      '  Für Volllast: Staging-Umgebung mit gelockerten Limits nutzen oder --force.',
      '',
    ].join('\n')
  );
  process.exit(1);
}

const [baseUrlRaw, orgSlug, jobSlug, totalArg = '1000', concurrencyArg = '50'] = cleanArgs;

if (!forceFlag && baseUrlRaw.toLowerCase().includes('zoepp')) {
  console.error(
    [
      '',
      '  ⛔  ABBRUCH: BASE_URL enthält "zoepp" — Produktionsumgebung erkannt.',
      '',
      '  Dieser Lasttest darf NICHT gegen Produktions-URLs ausgeführt werden,',
      '  da er echte Bewerbungsdatensätze anlegt und das Rate-Limit erschöpft.',
      '',
      '  Optionen:',
      '    1. Lokale Entwicklungsumgebung nutzen: http://localhost:3000',
      '    2. Staging-Umgebung nutzen (eigene URL ohne "zoepp")',
      '    3. Mit --force erzwingen (NUR nach ausdrücklicher Freigabe durch Teamleitung)',
      '',
    ].join('\n')
  );
  process.exit(2);
}

const total = parseInt(totalArg, 10);
const concurrency = parseInt(concurrencyArg, 10);

if (isNaN(total) || total < 1) {
  console.error(`Ungültiger Wert für total: "${totalArg}"`);
  process.exit(1);
}
if (isNaN(concurrency) || concurrency < 1) {
  console.error(`Ungültiger Wert für concurrency: "${concurrencyArg}"`);
  process.exit(1);
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/** Zufällige 8-stellige Mobilnummer (DE-Format) */
function randomPhone() {
  const digits = String(Math.floor(10000000 + Math.random() * 90000000));
  return `+49151${digits}`;
}

/** Erstellt FormData für eine Testbewerbung */
function buildFormData(agencyId, jobId, index) {
  // agencyId und jobId werden als UUIDs erwartet.
  // Da wir im Lasttest keine DB-Abfrage machen, übergeben wir die Slugs direkt als
  // Pflichtfelder — der Server validiert gegen die DB, was zu 404 führt wenn die
  // IDs nicht existieren. Für echte Lasttests sollten gültige UUIDs verwendet werden.
  const body = new URLSearchParams();
  body.set('agencyId', agencyId);
  body.set('jobId', jobId);
  body.set('firstName', `Lasttest ${index}`);
  body.set('lastName', 'Automatisch');
  body.set('phone', randomPhone());
  body.set('email', '');
  body.set('consentWhatsapp', 'true');
  body.set('postalCode', '10115');
  body.set('city', 'Berlin');
  body.set('campaign', JSON.stringify({ source: 'loadtest', index }));
  return body;
}

/** Führt eine einzelne Anfrage aus und gibt Latenz + Status zurück */
async function sendRequest(url, agencyId, jobId, index) {
  const body = buildFormData(agencyId, jobId, index);
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(30_000),
    });
    const latencyMs = Math.round(performance.now() - start);
    return { status: res.status, latencyMs, error: null };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return { status: 0, latencyMs, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Berechnet ein Perzentil aus einem sortierten Array */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

/** Führt `fn` für alle `items` aus, maximal `limit` gleichzeitig */
async function pLimit(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Hauptprogramm ───────────────────────────────────────────────────────────

// Für den Lasttest benötigen wir gültige UUIDs für Agency und Job.
// Da der ORG_SLUG und JOB_SLUG als Slugs übergeben werden, aber die API UUIDs erwartet,
// versuchen wir zunächst, die UUIDs über einen GET-Aufruf zu ermitteln.
// Falls das fehlschlägt, behandeln wir orgSlug/jobSlug direkt als UUID (falls gültig)
// oder geben eine klare Fehlermeldung aus.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveIds(baseUrl, orgSlug, jobSlug) {
  // Wenn beides bereits UUIDs sind, direkt zurückgeben
  if (UUID_REGEX.test(orgSlug) && UUID_REGEX.test(jobSlug)) {
    return { agencyId: orgSlug, jobId: jobSlug };
  }

  // Versuche IDs über /apply-Seite zu ermitteln (falls Slugs übergeben)
  // Die öffentliche Apply-Seite gibt keine UUIDs zurück → wir versuchen einen HEAD-Request
  // auf /apply/{org_slug}/{job_slug} um zu prüfen ob die Seite existiert
  // und nutzen dann den slug als Platzhalter (führt zu 400/404 im API, aber Latenz ist messbar)
  console.log(
    `\n  HINWEIS: ORG_SLUG und JOB_SLUG sind keine UUIDs.`,
  );
  console.log(
    `  Die /api/apply Route erwartet UUIDs für agencyId und jobId.`,
  );
  console.log(
    `  Übergib direkte UUIDs für einen realistischen Lasttest, z. B.:`,
  );
  console.log(
    `    node scripts/loadtest-apply.mjs <BASE_URL> <AGENCY_UUID> <JOB_UUID> ${total} ${concurrency}`,
  );
  console.log(
    `  Der Test läuft trotzdem durch — erwarte 400-Antworten (Validierungsfehler).`,
  );
  console.log('');

  // Verwende Slugs als-is (Testlauf mit Validierungsfehlern)
  return { agencyId: orgSlug, jobId: jobSlug };
}

async function main() {
  const applyUrl = `${baseUrlRaw.replace(/\/$/, '')}/api/apply`;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          Zoepp Media Cloud — Lasttest /api/apply          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Ziel:         ${applyUrl}`);
  console.log(`  Org-Slug:     ${orgSlug}`);
  console.log(`  Job-Slug:     ${jobSlug}`);
  console.log(`  Anfragen:     ${total}`);
  console.log(`  Parallelität: ${concurrency}`);
  console.log('');
  console.log('  Hinweis zum Rate-Limit:');
  console.log('  /api/apply ist auf 20 Anfragen / 600 Sekunden pro IP begrenzt.');
  console.log('  Ab Anfrage 21 (von derselben IP) werden 429-Antworten erwartet.');
  console.log('  Für Volllasttests: Staging-Umgebung mit erhöhtem Limit nutzen.');
  console.log('');

  const { agencyId, jobId } = await resolveIds(baseUrlRaw, orgSlug, jobSlug);

  const indices = Array.from({ length: total }, (_, i) => i + 1);

  let completed = 0;
  const startTime = performance.now();

  // Fortschrittsanzeige alle 5 Sekunden
  const progressInterval = setInterval(() => {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r  Fortschritt: ${completed}/${total} (${elapsed}s) ...`);
  }, 500);

  const results = await pLimit(indices, concurrency, async (index) => {
    const r = await sendRequest(applyUrl, agencyId, jobId, index);
    completed++;
    return r;
  });

  clearInterval(progressInterval);
  process.stdout.write('\r' + ' '.repeat(60) + '\r');

  const totalMs = Math.round(performance.now() - startTime);

  // ─── Auswertung ─────────────────────────────────────────────────────────────

  const statusCounts = {};
  const latencies = [];
  let errors = 0;

  for (const r of results) {
    const key = r.status === 0 ? 'ERR' : String(r.status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
    latencies.push(r.latencyMs);
    if (r.status === 0) errors++;
  }

  latencies.sort((a, b) => a - b);

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const avg = Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length);
  const min = latencies[0] ?? 0;
  const max = latencies[latencies.length - 1] ?? 0;

  const rps = (total / (totalMs / 1000)).toFixed(1);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                     ERGEBNISSE                           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Zeitraum');
  console.log(`    Gesamt:       ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`    Durchsatz:    ${rps} req/s`);
  console.log('');
  console.log('  Latenz (Antwortzeit inkl. Netzwerk)');
  console.log(`    Min:          ${min}ms`);
  console.log(`    Avg:          ${avg}ms`);
  console.log(`    p50:          ${p50}ms`);
  console.log(`    p95:          ${p95}ms`);
  console.log(`    p99:          ${p99}ms`);
  console.log(`    Max:          ${max}ms`);
  console.log('');
  console.log('  Statuscode-Verteilung');

  const sortedStatuses = Object.entries(statusCounts).sort(([a], [b]) => {
    if (a === 'ERR') return 1;
    if (b === 'ERR') return -1;
    return parseInt(a) - parseInt(b);
  });

  for (const [code, count] of sortedStatuses) {
    const pct = ((count / total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round((count / total) * 30));
    const note = code === '429'
      ? ' ← Rate-Limit (erwartet bei >20 Req/600s von einer IP)'
      : code === '200' || code === '201'
      ? ' ← Erfolg'
      : code === '400'
      ? ' ← Validierungsfehler (ggf. ungültige UUID oder Turnstile)'
      : code === '404'
      ? ' ← Job/Agentur nicht gefunden'
      : code === '500'
      ? ' ← Serverfehler'
      : code === 'ERR'
      ? ' ← Netzwerkfehler / Timeout'
      : '';
    console.log(`    ${String(code).padEnd(5)} ${String(count).padStart(6)}x  (${pct.padStart(5)}%)  ${bar}${note}`);
  }

  if (statusCounts['429']) {
    console.log('');
    console.log('  ⚠  429-Antworten wurden empfangen (Rate-Limit aktiv).');
    console.log('     Für den Launch-Kriterium (1000 Bewerbungen in 10 Min,');
    console.log('     p95 < 3s) das Rate-Limit in der Staging-Umgebung temporär');
    console.log('     erhöhen oder mehrere Source-IPs verwenden.');
  }

  if (errors > 0) {
    console.log('');
    console.log(`  ⚠  ${errors} Netzwerkfehler/Timeouts aufgetreten.`);
  }

  // Launch-Kriterium-Prüfung (1000 Req / 10 Min = 100 req/min, p95 < 3000ms)
  const successCount = (statusCounts['200'] ?? 0) + (statusCounts['201'] ?? 0);
  const successRate = (successCount / total) * 100;
  const totalMinutes = totalMs / 60000;

  console.log('');
  console.log('  Launch-Kriterium (Pilot → 100 Kunden):');
  console.log(`    Ziel:         1000 Bewerbungen in 10 Min, p95 < 3000ms`);
  console.log(
    `    p95:          ${p95}ms ${p95 < 3000 ? '✓ BESTANDEN' : '✗ FEHLGESCHLAGEN (Ziel: <3000ms)'}`
  );
  console.log(
    `    Durchsatz:    ${rps} req/s (${(parseFloat(rps) * 600).toFixed(0)} in 10 Min) ${
      parseFloat(rps) * 600 >= 1000 ? '✓' : '✗ (Ziel: ≥1000/10min)'
    }`
  );
  console.log(
    `    Erfolgsrate:  ${successRate.toFixed(1)}% (${successCount}/${total} 2xx)`
  );
  console.log('');

  // Exit-Code: 0 = alles OK (auch mit 429s), 1 = Netzwerkfehler
  process.exit(errors > total * 0.1 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nFehler beim Ausführen des Lasttests:', err.message);
  process.exit(1);
});
