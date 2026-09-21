# Phase 5: Indeed Apply + Meta-Zuordnung + Monitoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Indeed Apply (XML-Feed, Fragen-JSON, postUrl-Webhook mit Signaturprüfung, Redirect-Modus), Meta-Lead-Zuordnung über `lead_sources` mit Graph-API-Abruf, generischer Quellen-Webhook und Eingangs-Monitoring — alle Quellen münden in `ingestApplication()`.

**Architecture:** Externe Eingänge schreiben zuerst signaturgeprüft in `events_inbox` (Antwort < 2 s), der Minuten-Cron `/api/cron/tick` dispatcht `payload.type` an neue Worker (`ingest.indeed`, `ingest.generic`), die `ingestApplication()` aufrufen (Idempotenz über `applications.source_ref` + Unique-Index `events_inbox(source, external_id)`). Meta bleibt synchron im bestehenden Webhook, bekommt aber Formular→Job-Mapping und Graph-API-Abruf über die neue Tabelle `lead_sources`. Monitoring läuft im bestehenden `/api/cron/daily`.

**Tech Stack:** Next.js 16 App Router (async params!), TypeScript strict, Supabase (LIVE-DB qfzqoxeocyuqfreihiok — NUR additive Migrationen), Vitest, zod v4, Resend.

**Spec:** `docs/superpowers/specs/2026-09-21-spec-recruiting-plattform.md` §5, §6, §13, §16 (Phase 5)

## Global Constraints

- LIVE-Datenbank mit 6 echten Agenturen: Migrationen nur additiv (CREATE TABLE, ADD COLUMN, Constraint erweitern — nie DROP COLUMN/TABLE, nie destruktive UPDATEs).
- Service-Role umgeht RLS → JEDE Query auf agency-gescopte Tabellen trägt explizit `.eq('agency_id', ...)`. Fehlender Filter = BLOCKER.
- API-Auth-Kette (interne Routen): `getCurrentUser()`→401, bei Writes `canWriteRole(...)` aus `@/lib/recruiting/scope` (NICHT `@/lib/auth`)→403, `getEffectiveAgencyId()` OHNE Argument→403, Body-Parse→400.
- Externe Webhooks: Signatur/Secret-Prüfung fail-closed (Secret fehlt oder ungültig → 401/500, nie durchwinken); `crypto.timingSafeEqual` für Vergleiche.
- Button-Variants nur `primary`/`secondary`/`soft`/`ghost` — `outline` existiert NICHT.
- Deutsche UI-Texte mit echten Umlauten (ä/ö/ü/ß).
- Jeder neue Best-Effort-`catch` ruft `console.error` mit Kontext auf (Ausnahme: `request.json().catch` → 400 ist die Behandlung).
- `scheduled_jobs`-Upserts: `{ onConflict: 'dedupe_key', ignoreDuplicates: true }`.
- Nach jedem Task: `npx vitest run` grün (Stand: 515 Tests) und `npx next build` grün.
- Basis-URL-Muster: `process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de'`.
- Migration per `npx supabase db push` (bereits verlinkt) — Migrationsdateien nach Muster `supabase/migrations/20260921000030_*.sql` fortlaufend.

---

## Bestehende Bausteine (Konsumenten-Referenz)

- `ingestApplication(svc, input: IngestInput): Promise<IngestResult>` aus `@/lib/recruiting/ingest`. `IngestInput`: `{ agencyId, jobId, firstName, lastName, phone, email?, source, sourceRef?, campaign?, consentWhatsapp?, consentSource?, answers?: Array<{question: string; answer: string; origin: 'indeed'|'bot'|'form'}>, resume?: { storagePath: string; mime: string; size: number } | null }`. `IngestResult`: `{ candidateId, applicationId, candidateCreated, applicationCreated, duplicateWithin30Days, phoneInvalid }`. Fired intern bereits `application.created` + reiht `bot.open` ein (bei Consent + gültiger Nummer). Idempotenz: prüft zuerst `(agency_id, source, source_ref)`.
- `events_inbox`: Spalten `source, external_id, agency_id (nullable), payload jsonb, status, attempts, retry_at, error`. Unique-Index `(source, external_id) WHERE external_id IS NOT NULL`. Cron-Tick dispatcht auf `payload.type`.
- `/api/cron/tick` (`src/app/api/cron/tick/route.ts`): Events-Switch auf `payload.type` (Zeilen ~85–95), Worker-Signatur-Muster `processX(svc, agencyId, payload)`.
- `createNotificationForAgency(svc, agencyId, { title, body, type: 'system', push_url })` aus `@/lib/notifications/create`.
- `logActivity(svc, {...})` aus `@/lib/activity/log` — Aufrufmuster aus `src/lib/recruiting/ingest.ts` Zeile ~295 kopieren.
- Storage-Upload-Muster: `src/lib/workers/media-download.ts` Zeilen 40–50.
- HMAC-Verify-Muster (fail-closed, timingSafeEqual): `src/app/api/webhooks/meta/route.ts`.
- E-Mail: `src/lib/email/resend.ts` (Resend, `getResend().emails.send({ from: FROM, to, subject, html })`).
- Jobs-Tabelle: `slug` (unique je Agentur), `external_ref text`, `indeed_mode text CHECK IN ('apply','redirect','off') DEFAULT 'off'`, `status`.
- `agencies.slug` (unique, NOT NULL).
- Öffentliches Formular: `/apply/{org_slug}/{job_slug}` existiert.
- Audit: Tabelle `audit_log` (entity_type/action mit CHECK-Constraints — werden in Task 1 erweitert).

---

### Task 1: Migration — lead_sources, indeed_feed_key, feed_polls, Bucket, Audit-Erweiterung

**Files:**
- Create: `supabase/migrations/20260921000030_phase5_sources.sql`

**Interfaces:**
- Produces: Tabelle `lead_sources(id, agency_id, kind 'meta'|'generic', name, secret, config jsonb, active, created_at)`; `agencies.indeed_feed_key text NOT NULL`; Tabelle `feed_polls(id, agency_id, polled_at)`; Storage-Bucket `recruiting-documents`; `audit_log.entity_type` erlaubt zusätzlich `'webhook'`, `audit_log.action` zusätzlich `'reject'`.

- [ ] **Step 1: Migration schreiben**

```sql
-- Phase 5: Quellen (Indeed, Meta, generisch) — Spec §5/§6/§13

-- 1. lead_sources: konfigurierte Eingangsquellen je Mandant (Service-Role-only, wie events_inbox)
CREATE TABLE IF NOT EXISTS lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('meta','generic')),
  name text NOT NULL,
  secret text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_sources_agency ON lead_sources(agency_id);
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;

-- 2. Feed-Key je Agentur (geheimer ?key= für den Indeed-XML-Feed)
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS indeed_feed_key text;
UPDATE agencies SET indeed_feed_key = encode(gen_random_bytes(24), 'hex') WHERE indeed_feed_key IS NULL;
ALTER TABLE agencies ALTER COLUMN indeed_feed_key SET NOT NULL;

-- 3. Feed-Abruf-Protokoll fürs Monitoring (Spec §5 Monitoring)
CREATE TABLE IF NOT EXISTS feed_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  polled_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feed_polls_agency_time ON feed_polls(agency_id, polled_at);
ALTER TABLE feed_polls ENABLE ROW LEVEL SECURITY;

-- 4. Privater Bucket für Lebensläufe aus Indeed Apply
INSERT INTO storage.buckets (id, name, public) VALUES ('recruiting-documents', 'recruiting-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Audit-Log-Constraints erweitern (ungültige Webhook-Signatur → Audit-Eintrag, Spec §5)
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_entity_type_check CHECK (entity_type IN ('candidate','agency','user','automation','template','pipeline_stage','consent','recording','settings','webhook'));
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN ('create','update','delete','access','impersonate','reject'));
```

Hinweis: `audit_log.entity_id` ist `UUID NOT NULL` — für Webhook-Rejects wird `gen_random_uuid()` clientseitig erzeugt (Task 4).

- [ ] **Step 2: Push + verifizieren**

Run: `npx supabase db push` — dann per `npx supabase migration list` prüfen, dass 20260921000030 remote gelistet ist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260921000030_phase5_sources.sql
git commit -m "feat(sources): lead_sources, indeed_feed_key, feed_polls, Dokument-Bucket (Phase 5 Task 1)"
```

---

### Task 2: Indeed-XML-Feed `/api/feeds/indeed/{org_slug}.xml`

**Files:**
- Create: `src/lib/indeed/feed.ts`
- Create: `src/lib/indeed/__tests__/feed.test.ts`
- Create: `src/app/api/feeds/indeed/[slug]/route.ts`

**Interfaces:**
- Produces: `buildIndeedFeed(params: { agencyName: string; agencySlug: string; baseUrl: string; jobs: FeedJob[] }): string` mit `FeedJob = { id: string; title: string; slug: string; city: string | null; description: string | null; indeed_mode: 'apply' | 'redirect'; created_at: string; external_ref: string | null }`.
- Consumes: `agencies.indeed_feed_key`, `jobs.indeed_mode` (Task 1 / bestehend), `feed_polls` (Task 1).

- [ ] **Step 1: Failing Test schreiben** (`src/lib/indeed/__tests__/feed.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { buildIndeedFeed, cdata } from '@/lib/indeed/feed';

const base = {
  agencyName: 'Test GmbH & Co',
  agencySlug: 'test-gmbh',
  baseUrl: 'https://cloud.zoeppmedia.de',
};
const job = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  title: 'Vertriebsmitarbeiter (m/w/d)',
  slug: 'vertrieb',
  city: 'Köln',
  description: 'Tolles Team',
  indeed_mode: 'apply' as const,
  created_at: '2026-09-21T10:00:00Z',
  external_ref: null,
};

describe('buildIndeedFeed', () => {
  it('erzeugt gültiges XML mit source und job', () => {
    const xml = buildIndeedFeed({ ...base, jobs: [job] });
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain('<source>');
    expect(xml).toContain('<![CDATA[Test GmbH & Co]]>');
    expect(xml).toContain('<job>');
  });

  it('apply-Modus: indeed-apply-data mit postUrl und questions-URL', () => {
    const xml = buildIndeedFeed({ ...base, jobs: [job] });
    expect(xml).toContain('indeed-apply-data');
    expect(xml).toContain(encodeURIComponent('https://cloud.zoeppmedia.de/api/webhooks/indeed/apply'));
    expect(xml).toContain(encodeURIComponent(`https://cloud.zoeppmedia.de/api/indeed/questions/${job.id}.json`));
    expect(xml).toContain(`indeed-apply-jobId=${encodeURIComponent(job.id)}`);
  });

  it('redirect-Modus: keine indeed-apply-data, URL zeigt auf /apply mit src=indeed', () => {
    const xml = buildIndeedFeed({ ...base, jobs: [{ ...job, indeed_mode: 'redirect' as const }] });
    expect(xml).not.toContain('indeed-apply-data');
    expect(xml).toContain('/apply/test-gmbh/vertrieb?src=indeed');
  });

  it('cdata escapt "]]>"', () => {
    expect(cdata('a]]>b')).toBe('<![CDATA[a]]]]><![CDATA[>b]]>');
  });
});
```

- [ ] **Step 2: Test rot laufen lassen** — `npx vitest run src/lib/indeed/__tests__/feed.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: `src/lib/indeed/feed.ts` implementieren**

```ts
export interface FeedJob {
  id: string;
  title: string;
  slug: string;
  city: string | null;
  description: string | null;
  indeed_mode: 'apply' | 'redirect';
  created_at: string;
  external_ref: string | null;
}

export function cdata(value: string): string {
  return `<![CDATA[${value.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

/** Baut den Indeed-XML-Feed für einen Mandanten (Spec §5 Modus A + B). */
export function buildIndeedFeed(params: {
  agencyName: string;
  agencySlug: string;
  baseUrl: string;
  jobs: FeedJob[];
}): string {
  const { agencyName, agencySlug, baseUrl, jobs } = params;
  const jobsXml = jobs.map((job) => {
    const applyUrl = `${baseUrl}/apply/${agencySlug}/${job.slug}?src=indeed`;
    let applyData = '';
    if (job.indeed_mode === 'apply') {
      const qs = [
        `indeed-apply-jobId=${encodeURIComponent(job.id)}`,
        `indeed-apply-jobTitle=${encodeURIComponent(job.title)}`,
        `indeed-apply-jobCompanyName=${encodeURIComponent(agencyName)}`,
        `indeed-apply-jobUrl=${encodeURIComponent(applyUrl)}`,
        `indeed-apply-postUrl=${encodeURIComponent(`${baseUrl}/api/webhooks/indeed/apply`)}`,
        `indeed-apply-questions=${encodeURIComponent(`${baseUrl}/api/indeed/questions/${job.id}.json`)}`,
      ].join('&');
      applyData = `\n    <indeed-apply-data>${cdata(qs)}</indeed-apply-data>`;
    }
    return `  <job>
    <title>${cdata(job.title)}</title>
    <date>${cdata(new Date(job.created_at).toUTCString())}</date>
    <referencenumber>${cdata(job.external_ref || job.id)}</referencenumber>
    <url>${cdata(applyUrl)}</url>
    <company>${cdata(agencyName)}</company>
    <city>${cdata(job.city || '')}</city>
    <country>${cdata('DE')}</country>
    <description>${cdata(job.description || job.title)}</description>${applyData}
  </job>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>${cdata(agencyName)}</publisher>
  <publisherurl>${cdata(baseUrl)}</publisherurl>
${jobsXml}
</source>`;
}
```

Hinweis: Falls `jobs` keine `city`/`description`-Spalten hat, die tatsächlichen Spaltennamen aus `supabase/migrations/20260921000002_jobs_applications.sql` verwenden (z. B. `location`) und Test + Interface entsprechend anpassen — das Interface `FeedJob` ist die Wahrheit für die Route.

- [ ] **Step 4: Test grün** — `npx vitest run src/lib/indeed/__tests__/feed.test.ts` → PASS.

- [ ] **Step 5: Route `src/app/api/feeds/indeed/[slug]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildIndeedFeed, FeedJob } from '@/lib/indeed/feed';
import { timingSafeEqual } from 'crypto';

/** GET /api/feeds/indeed/{org_slug}.xml?key={secret} — XML-Feed je Mandant (Spec §5). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params;
  const slug = rawSlug.replace(/\.xml$/, '');
  const key = request.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = createAdminClient();
  const { data: agency } = await svc
    .from('agencies')
    .select('id, name, slug, indeed_feed_key')
    .eq('slug', slug)
    .single();
  if (!agency) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const a = Buffer.from(key);
  const b = Buffer.from(agency.indeed_feed_key as string);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: jobs } = await svc
    .from('jobs')
    .select('id, title, slug, city, description, indeed_mode, created_at, external_ref')
    .eq('agency_id', agency.id)
    .eq('status', 'active')
    .in('indeed_mode', ['apply', 'redirect']);

  // Feed-Abruf fürs Monitoring protokollieren (best effort)
  await svc.from('feed_polls').insert({ agency_id: agency.id }).then(
    () => {},
    (e: unknown) => console.error('[indeed-feed] feed_polls insert fehlgeschlagen', e)
  );

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';
  const xml = buildIndeedFeed({
    agencyName: agency.name,
    agencySlug: agency.slug,
    baseUrl,
    jobs: (jobs ?? []) as FeedJob[],
  });
  return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
```

Die `select`-Spaltenliste an die realen jobs-Spalten anpassen (siehe Hinweis Step 3).

- [ ] **Step 6: Build + alle Tests** — `npx next build` und `npx vitest run` grün.

- [ ] **Step 7: Commit**

```bash
git add src/lib/indeed src/app/api/feeds
git commit -m "feat(indeed): XML-Feed je Mandant mit Apply- und Redirect-Modus (Phase 5 Task 2)"
```

---

### Task 3: Screening-Fragen-JSON `/api/indeed/questions/{job_id}.json`

**Files:**
- Create: `src/app/api/indeed/questions/[job_id]/route.ts`
- Create: `src/app/api/indeed/questions/__tests__/questions.test.ts`

**Interfaces:**
- Produces: öffentliches JSON im Indeed-Screener-Format; Frage-IDs `phone` und `consent_whatsapp` (Task 5 liest die Antwort auf `consent_whatsapp`).

- [ ] **Step 1: Failing Test** — exportierte Builder-Funktion testen:

```ts
import { describe, it, expect } from 'vitest';
import { buildQuestions } from '@/app/api/indeed/questions/[job_id]/route';

describe('buildQuestions', () => {
  it('enthält Pflichtfragen Telefon und WhatsApp-Einwilligung', () => {
    const q = buildQuestions();
    const ids = q.questions.map((x) => x.id);
    expect(ids).toContain('phone');
    expect(ids).toContain('consent_whatsapp');
    expect(q.questions.every((x) => x.required)).toBe(true);
  });
});
```

- [ ] **Step 2: Test rot laufen lassen.**

- [ ] **Step 3: Route implementieren**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Screening-Fragen für Indeed Apply (Spec §5): Pflicht sind Telefon + WhatsApp-Opt-in. */
export function buildQuestions() {
  return {
    schemaVersion: '1.0',
    questions: [
      {
        id: 'phone',
        type: 'phone',
        question: 'Wie lautet deine Telefonnummer?',
        required: true,
      },
      {
        id: 'consent_whatsapp',
        type: 'select',
        question: 'Dürfen wir dich zur Bewerbung per WhatsApp kontaktieren?',
        required: true,
        options: [
          { label: 'Ja', value: 'ja' },
          { label: 'Nein', value: 'nein' },
        ],
      },
    ],
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  const { job_id: raw } = await params;
  const jobId = raw.replace(/\.json$/, '');

  const svc = createAdminClient();
  const { data: job } = await svc
    .from('jobs')
    .select('id, status, indeed_mode')
    .eq('id', jobId)
    .single();
  if (!job || job.status !== 'active' || job.indeed_mode !== 'apply') {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  }
  return NextResponse.json(buildQuestions());
}
```

Falls `jobId` kein UUID ist, wirft `.single()` keinen Fehler, aber Postgres einen Cast-Fehler → vorab mit `isUuid` aus `@/lib/supabase/filters` prüfen und bei Nicht-UUID 404 zurückgeben.

- [ ] **Step 4: Test grün + Build grün.**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/indeed
git commit -m "feat(indeed): Screening-Fragen-JSON mit Pflicht-Opt-in (Phase 5 Task 3)"
```

---

### Task 4: postUrl-Webhook `/api/webhooks/indeed/apply`

**Files:**
- Create: `src/app/api/webhooks/indeed/apply/route.ts`
- Create: `src/app/api/webhooks/indeed/apply/__tests__/apply.test.ts`

**Interfaces:**
- Consumes: `INDEED_APPLY_SECRET` (env, neu — in Vercel setzen), `events_inbox`, `audit_log` (Task 1: entity_type 'webhook', action 'reject').
- Produces: `events_inbox`-Row `{ source: 'indeed', external_id: <Indeed-Apply-ID>, agency_id, payload: { type: 'ingest.indeed', body } }` — Task 5 konsumiert `payload.body`.

Anforderungen (Spec §5): Antwort < 2 s (nur Signatur + ein Insert), ungültige Signatur → 401 + Audit-Eintrag, doppelte Zustellung → 200 ohne zweite Row (Unique-Index `events_inbox(source, external_id)`), interner Fehler → 5xx (Indeed stellt erneut zu).

- [ ] **Step 1: Failing Tests** — Signaturlogik als exportierte Funktion testen:

```ts
import { describe, it, expect } from 'vitest';
import { verifyIndeedSignature } from '@/app/api/webhooks/indeed/apply/route';
import { createHmac } from 'crypto';

const secret = 'test-secret';
const body = JSON.stringify({ id: 'abc' });
const sig = createHmac('sha1', secret).update(body).digest('base64');

describe('verifyIndeedSignature', () => {
  it('akzeptiert gültige Signatur', () => {
    expect(verifyIndeedSignature(body, sig, secret)).toBe(true);
  });
  it('lehnt falsche Signatur ab', () => {
    expect(verifyIndeedSignature(body, 'falsch', secret)).toBe(false);
  });
  it('lehnt leere Signatur ab', () => {
    expect(verifyIndeedSignature(body, null, secret)).toBe(false);
  });
});
```

- [ ] **Step 2: Test rot laufen lassen.**

- [ ] **Step 3: Route implementieren**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { isUuid } from '@/lib/supabase/filters';

/**
 * POST /api/webhooks/indeed/apply — Indeed-Apply-Bewerbungen (Spec §5).
 * Nur Signatur prüfen + events_inbox schreiben; Verarbeitung asynchron im Cron-Tick.
 * Indeed signiert den Rohbody mit HMAC-SHA1 (Base64) im Header X-Indeed-Signature.
 */
export function verifyIndeedSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha1', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.INDEED_APPLY_SECRET;
  if (!secret) {
    console.error('[indeed-apply] INDEED_APPLY_SECRET nicht konfiguriert');
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 });
  }

  const rawBody = await request.text();
  const svc = createAdminClient();

  if (!verifyIndeedSignature(rawBody, request.headers.get('x-indeed-signature'), secret)) {
    // Audit-Eintrag für abgelehnte Signatur (Spec §5)
    await svc.from('audit_log').insert({
      entity_type: 'webhook',
      entity_id: randomUUID(),
      action: 'reject',
      changes: { source: 'indeed', reason: 'invalid_signature' },
    }).then(
      () => {},
      (e: unknown) => console.error('[indeed-apply] Audit-Insert fehlgeschlagen', e)
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 });
  }

  const applyId = typeof body.id === 'string' ? body.id : null;
  if (!applyId) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });

  // Agentur über den Job auflösen (jobId = unsere Job-UUID ODER external_ref)
  const job = (body.job ?? {}) as { jobId?: string };
  let agencyId: string | null = null;
  if (job.jobId) {
    const query = isUuid(job.jobId)
      ? svc.from('jobs').select('agency_id').eq('id', job.jobId).single()
      : svc.from('jobs').select('agency_id').eq('external_ref', job.jobId).limit(1).single();
    const { data } = await query;
    agencyId = data?.agency_id ?? null;
  }

  const { error } = await svc.from('events_inbox').insert({
    source: 'indeed',
    external_id: applyId,
    agency_id: agencyId,
    payload: { type: 'ingest.indeed', body },
  });
  if (error) {
    if (error.code === '23505') {
      // Doppelte Zustellung — idempotent, keine zweite Bewerbung (Spec §5)
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error('[indeed-apply] events_inbox insert fehlgeschlagen', error.message);
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Tests grün + Build grün.**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/indeed/apply
git commit -m "feat(indeed): postUrl-Webhook mit HMAC-Prüfung, Audit und Idempotenz (Phase 5 Task 4)"
```

---

### Task 5: Worker `ingest.indeed` + Tick-Verdrahtung + Opt-in-Fallback-Mail

**Files:**
- Create: `src/lib/workers/ingest-indeed.ts`
- Create: `src/lib/workers/__tests__/ingest-indeed.test.ts`
- Modify: `src/app/api/cron/tick/route.ts` (Events-Switch, neben `whatsapp.inbound`)
- Modify: `src/lib/email/resend.ts` (eine neue Funktion anhängen)

**Interfaces:**
- Consumes: `payload.body` aus Task 4; `ingestApplication` (siehe Bausteine); Bucket `recruiting-documents` (Task 1).
- Produces: `processIngestIndeed(svc: SupabaseClient, agencyId: string | null, payload: { body: Record<string, unknown> }): Promise<void>`; `sendOptInFallbackEmail(to: string, firstName: string, applyUrl: string)` in resend.ts.

- [ ] **Step 1: Failing Tests** — Extraktion als reine Funktion testen (`extractIndeedApplication` exportieren):

```ts
import { describe, it, expect } from 'vitest';
import { extractIndeedApplication } from '@/lib/workers/ingest-indeed';

const body = {
  id: 'apply-123',
  job: { jobId: 'aaaaaaaa-0000-0000-0000-000000000001' },
  applicant: {
    fullName: 'Max Mustermann',
    firstName: 'Max',
    lastName: 'Mustermann',
    email: 'max@example.com',
    phoneNumber: '+49 171 1234567',
    resume: { file: { contentType: 'application/pdf', fileName: 'cv.pdf', data: 'JVBERi0=' } },
  },
  questionsAndAnswers: [
    { question: { id: 'phone', question: 'Wie lautet deine Telefonnummer?' }, answer: '+49 171 1234567' },
    { question: { id: 'consent_whatsapp', question: 'Dürfen wir dich per WhatsApp kontaktieren?' }, answer: 'ja' },
  ],
};

describe('extractIndeedApplication', () => {
  it('extrahiert Name, Telefon, E-Mail, Job und Consent', () => {
    const r = extractIndeedApplication(body);
    expect(r.firstName).toBe('Max');
    expect(r.lastName).toBe('Mustermann');
    expect(r.phone).toBe('+49 171 1234567');
    expect(r.email).toBe('max@example.com');
    expect(r.jobRef).toBe('aaaaaaaa-0000-0000-0000-000000000001');
    expect(r.consentWhatsapp).toBe(true);
    expect(r.applyId).toBe('apply-123');
  });
  it('consent nein → false', () => {
    const b = structuredClone(body);
    b.questionsAndAnswers[1].answer = 'nein';
    expect(extractIndeedApplication(b).consentWhatsapp).toBe(false);
  });
  it('fullName-Fallback ohne firstName/lastName', () => {
    const b = structuredClone(body) as Record<string, unknown>;
    (b.applicant as Record<string, unknown>).firstName = undefined;
    (b.applicant as Record<string, unknown>).lastName = undefined;
    const r = extractIndeedApplication(b);
    expect(r.firstName).toBe('Max');
    expect(r.lastName).toBe('Mustermann');
  });
  it('answers als Q&A-Liste mit origin indeed', () => {
    const r = extractIndeedApplication(body);
    expect(r.answers).toHaveLength(2);
    expect(r.answers[0]).toMatchObject({ origin: 'indeed' });
  });
  it('resume-Base64 wird erkannt', () => {
    const r = extractIndeedApplication(body);
    expect(r.resume?.mime).toBe('application/pdf');
    expect(r.resume?.data.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Tests rot laufen lassen.**

- [ ] **Step 3: Worker implementieren** (`src/lib/workers/ingest-indeed.ts`)

```ts
import { SupabaseClient } from '@supabase/supabase-js';
import { ingestApplication } from '@/lib/recruiting/ingest';
import { logActivity } from '@/lib/activity/log';
import { sendOptInFallbackEmail } from '@/lib/email/resend';
import { isUuid } from '@/lib/supabase/filters';

interface Extracted {
  applyId: string;
  jobRef: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  consentWhatsapp: boolean;
  answers: Array<{ question: string; answer: string; origin: 'indeed' }>;
  resume: { data: string; mime: string; fileName: string } | null;
}

export function extractIndeedApplication(body: Record<string, unknown>): Extracted {
  const applicant = (body.applicant ?? {}) as Record<string, unknown>;
  const job = (body.job ?? {}) as Record<string, unknown>;
  const qa = (Array.isArray(body.questionsAndAnswers) ? body.questionsAndAnswers : []) as Array<{
    question?: { id?: string; question?: string };
    answer?: unknown;
  }>;

  let firstName = typeof applicant.firstName === 'string' ? applicant.firstName : '';
  let lastName = typeof applicant.lastName === 'string' ? applicant.lastName : '';
  if (!firstName && typeof applicant.fullName === 'string') {
    const parts = applicant.fullName.trim().split(/\s+/);
    firstName = parts[0] ?? '';
    lastName = parts.slice(1).join(' ');
  }

  const answerFor = (id: string): string | null => {
    const hit = qa.find((x) => x.question?.id === id);
    return hit && hit.answer != null ? String(hit.answer) : null;
  };

  const phone =
    (typeof applicant.phoneNumber === 'string' && applicant.phoneNumber) ||
    answerFor('phone') || '';
  const consentWhatsapp = (answerFor('consent_whatsapp') ?? '').toLowerCase() === 'ja';

  const file = ((applicant.resume as Record<string, unknown> | undefined)?.file ?? null) as
    | { contentType?: string; fileName?: string; data?: string }
    | null;
  const resume =
    file && typeof file.data === 'string' && file.data.length > 0
      ? { data: file.data, mime: file.contentType || 'application/pdf', fileName: file.fileName || 'lebenslauf.pdf' }
      : null;

  return {
    applyId: String(body.id ?? ''),
    jobRef: typeof job.jobId === 'string' ? job.jobId : null,
    firstName,
    lastName,
    phone,
    email: typeof applicant.email === 'string' ? applicant.email : null,
    consentWhatsapp,
    answers: qa.map((x) => ({
      question: x.question?.question ?? x.question?.id ?? 'Frage',
      answer: x.answer != null ? String(x.answer) : '',
      origin: 'indeed' as const,
    })),
    resume,
  };
}

/** Worker für events_inbox payload.type = 'ingest.indeed' (Spec §5 Schritt 5). */
export async function processIngestIndeed(
  svc: SupabaseClient,
  agencyId: string | null,
  payload: { body: Record<string, unknown> }
): Promise<void> {
  const x = extractIndeedApplication(payload.body);
  if (!x.applyId || !x.jobRef) throw new Error('ingest.indeed: id oder job.jobId fehlt');

  // Job auflösen (UUID oder external_ref) — Agentur kommt aus dem Job
  const jobQuery = isUuid(x.jobRef)
    ? svc.from('jobs').select('id, agency_id, slug').eq('id', x.jobRef).single()
    : svc.from('jobs').select('id, agency_id, slug').eq('external_ref', x.jobRef).limit(1).single();
  const { data: job } = await jobQuery;
  if (!job) throw new Error(`ingest.indeed: Job ${x.jobRef} nicht gefunden`);
  if (agencyId && job.agency_id !== agencyId) throw new Error('ingest.indeed: agency mismatch');

  // Lebenslauf zuerst in den Storage, damit ingestApplication die documents-Row anlegt
  let resume: { storagePath: string; mime: string; size: number } | null = null;
  if (x.resume) {
    const buffer = Buffer.from(x.resume.data, 'base64');
    const ext = x.resume.fileName.split('.').pop() || 'pdf';
    const storagePath = `${job.agency_id}/resumes/indeed-${x.applyId}.${ext}`;
    const { error: uploadErr } = await svc.storage
      .from('recruiting-documents')
      .upload(storagePath, buffer, { contentType: x.resume.mime, upsert: true });
    if (uploadErr) {
      console.error('[ingest.indeed] Lebenslauf-Upload fehlgeschlagen', uploadErr.message);
    } else {
      resume = { storagePath, mime: x.resume.mime, size: buffer.length };
    }
  }

  const result = await ingestApplication(svc, {
    agencyId: job.agency_id,
    jobId: job.id,
    firstName: x.firstName,
    lastName: x.lastName,
    phone: x.phone,
    email: x.email ?? undefined,
    source: 'indeed',
    sourceRef: x.applyId,
    consentWhatsapp: x.consentWhatsapp,
    consentSource: 'indeed',
    answers: x.answers,
    resume,
  });

  // Spec §5: ohne Telefon/Opt-in kein Bot — Hinweis + E-Mail mit Formular-Link
  if (!x.consentWhatsapp || result.phoneInvalid) {
    await logActivity(svc, {
      agency_id: job.agency_id,
      candidate_id: result.candidateId,
      type: 'note',
      content: 'Kein WhatsApp-Opt-in aus Indeed-Bewerbung — Bot nicht gestartet.',
    }).catch((e) => console.error('[ingest.indeed] logActivity fehlgeschlagen', e));

    if (x.email) {
      const { data: agency } = await svc.from('agencies').select('slug').eq('id', job.agency_id).single();
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';
      if (agency) {
        await sendOptInFallbackEmail(x.email, x.firstName, `${baseUrl}/apply/${agency.slug}/${job.slug}`)
          .catch((e) => console.error('[ingest.indeed] Fallback-Mail fehlgeschlagen', e));
      }
    }
  }
}
```

`logActivity`-Aufrufform exakt an die bestehende Signatur in `@/lib/activity/log` anpassen (Muster in `src/lib/recruiting/ingest.ts` nachlesen — Feldnamen können abweichen).

- [ ] **Step 4: `sendOptInFallbackEmail` in `src/lib/email/resend.ts` anhängen**

```ts
export async function sendOptInFallbackEmail(to: string, firstName: string, applyUrl: string) {
  return getResend().emails.send({
    from: FROM,
    to,
    subject: 'Deine Bewerbung — ein Schritt fehlt noch',
    html: `<p>Hallo ${firstName},</p><p>danke für deine Bewerbung! Damit wir dich schnell erreichen können, bestätige bitte kurz deine Telefonnummer und die Kontaktaufnahme über unser Formular:</p><p><a href="${applyUrl}">${applyUrl}</a></p><p>Viele Grüße<br/>Dein Recruiting-Team</p>`,
  });
}
```

- [ ] **Step 5: Tick verdrahten** — in `src/app/api/cron/tick/route.ts` im Events-Switch ergänzen:

```ts
case 'ingest.indeed':
  await processIngestIndeed(svc, event.agency_id, payload as unknown as Parameters<typeof processIngestIndeed>[2]);
  break;
```

plus Import `import { processIngestIndeed } from '@/lib/workers/ingest-indeed';`.

- [ ] **Step 6: Alle Tests + Build grün.**

- [ ] **Step 7: Commit**

```bash
git add src/lib/workers/ingest-indeed.ts src/lib/workers/__tests__/ingest-indeed.test.ts src/app/api/cron/tick/route.ts src/lib/email/resend.ts
git commit -m "feat(indeed): ingest.indeed-Worker mit Lebenslauf-Upload und Opt-in-Fallback (Phase 5 Task 5)"
```

---

### Task 6: Meta-Webhook — Formular→Job-Mapping + Graph-API-Abruf

**Files:**
- Create: `src/lib/meta/lead-mapping.ts`
- Create: `src/lib/meta/__tests__/lead-mapping.test.ts`
- Modify: `src/app/api/webhooks/meta/route.ts`

**Interfaces:**
- Consumes: `lead_sources` (kind 'meta', `config` jsonb: `{ page_token?: string; forms?: Record<string /* form_id */, string /* job_id */>; default_job_id?: string }`).
- Produces: `resolveMetaJob(sources: MetaSource[], formId: string | null): { jobId: string | null; pageToken: string | null }` mit `MetaSource = { config: { page_token?: string; forms?: Record<string, string>; default_job_id?: string } }`; `fetchLeadFromGraph(leadgenId: string, pageToken: string): Promise<Array<{ name: string; values: string[] }> | null>`.

Die Route bleibt unter `/api/webhooks/meta` (bereits bei Meta registriert; Spec nennt `/api/webhooks/meta/leads` — bewusste Abweichung, im Ledger notieren). Bestehende Signaturprüfung, `ingestApplication`-Aufruf (source 'meta', sourceRef leadgen_id) und Notification/Blacklist-Nachverarbeitung UNVERÄNDERT lassen.

- [ ] **Step 1: Failing Tests** (`lead-mapping.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { resolveMetaJob } from '@/lib/meta/lead-mapping';

const src = (config: Record<string, unknown>) => ({ config });

describe('resolveMetaJob', () => {
  it('mappt form_id auf job_id', () => {
    const r = resolveMetaJob([src({ forms: { f1: 'job-a' }, page_token: 'tok' })], 'f1');
    expect(r.jobId).toBe('job-a');
    expect(r.pageToken).toBe('tok');
  });
  it('fällt auf default_job_id zurück', () => {
    const r = resolveMetaJob([src({ forms: { f1: 'job-a' }, default_job_id: 'job-x' })], 'f2');
    expect(r.jobId).toBe('job-x');
  });
  it('ohne Quelle: null', () => {
    expect(resolveMetaJob([], 'f1')).toEqual({ jobId: null, pageToken: null });
  });
  it('bevorzugt Quelle mit passendem Formular vor Quelle mit nur default', () => {
    const r = resolveMetaJob(
      [src({ default_job_id: 'job-x' }), src({ forms: { f1: 'job-a' } })],
      'f1'
    );
    expect(r.jobId).toBe('job-a');
  });
});
```

- [ ] **Step 2: Tests rot laufen lassen.**

- [ ] **Step 3: `src/lib/meta/lead-mapping.ts` implementieren**

```ts
export interface MetaSourceConfig {
  page_token?: string;
  forms?: Record<string, string>;
  default_job_id?: string;
}
export interface MetaSource {
  config: MetaSourceConfig;
}

/** Zuordnung Meta-Formular → Job über lead_sources.config (Spec §6). */
export function resolveMetaJob(
  sources: MetaSource[],
  formId: string | null
): { jobId: string | null; pageToken: string | null } {
  if (formId) {
    const exact = sources.find((s) => s.config.forms?.[formId]);
    if (exact) {
      return { jobId: exact.config.forms![formId], pageToken: exact.config.page_token ?? null };
    }
  }
  const fallback = sources.find((s) => s.config.default_job_id);
  if (fallback) {
    return { jobId: fallback.config.default_job_id!, pageToken: fallback.config.page_token ?? null };
  }
  const anyToken = sources.find((s) => s.config.page_token);
  return { jobId: null, pageToken: anyToken?.config.page_token ?? null };
}

/** Lead-Felder über die Graph API mit dem Seiten-Token des Kunden abrufen (Spec §6). */
export async function fetchLeadFromGraph(
  leadgenId: string,
  pageToken: string
): Promise<Array<{ name: string; values: string[] }> | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}?fields=field_data&access_token=${encodeURIComponent(pageToken)}`
    );
    if (!res.ok) {
      console.error('[meta-leads] Graph-API-Abruf fehlgeschlagen', res.status);
      return null;
    }
    const data = (await res.json()) as { field_data?: Array<{ name: string; values: string[] }> };
    return data.field_data ?? null;
  } catch (e) {
    console.error('[meta-leads] Graph-API-Abruf fehlgeschlagen', e);
    return null;
  }
}
```

- [ ] **Step 4: Tests grün.**

- [ ] **Step 5: `src/app/api/webhooks/meta/route.ts` erweitern**

Im leadgen-Zweig, VOR der bestehenden Default-Job-Logik:

1. `const { data: sources } = await svc.from('lead_sources').select('config').eq('agency_id', agencyId).eq('kind', 'meta').eq('active', true);`
2. `const { jobId: mappedJobId, pageToken } = resolveMetaJob((sources ?? []) as MetaSource[], formId);` — `formId` aus dem leadgen-Event (`value.form_id`), falls dort noch nicht extrahiert, extrahieren.
3. Wenn `pageToken` vorhanden: `const graphFields = await fetchLeadFromGraph(leadgenId, pageToken);` — wenn nicht null, `graphFields` statt der Payload-`field_data` für die Feld-Extraktion verwenden (bestehende Extraktions-Helper wiederverwenden; beide Formate sind `{name, values[]}`).
4. Job-Wahl: `mappedJobId ?? bisheriger Default-Job-Fallback`. Der Kommentar „bis Meta-Formular→Job-Mapping in Phase 5 kommt" wird entfernt; der Default-Job-Fallback bleibt als letzte Stufe bestehen.
5. Alles Übrige (Signatur, ingestApplication mit source 'meta'/sourceRef leadgen_id, Notification, Blacklist) unverändert.

- [ ] **Step 6: Alle Tests + Build grün.**

- [ ] **Step 7: Commit**

```bash
git add src/lib/meta src/app/api/webhooks/meta/route.ts
git commit -m "feat(meta): Formular-zu-Job-Mapping über lead_sources und Graph-API-Lead-Abruf (Phase 5 Task 6)"
```

---

### Task 7: Generischer Webhook `/api/webhooks/generic/{source_id}` + Worker `ingest.generic`

**Files:**
- Create: `src/app/api/webhooks/generic/[source_id]/route.ts`
- Create: `src/lib/workers/ingest-generic.ts`
- Create: `src/lib/workers/__tests__/ingest-generic.test.ts`
- Modify: `src/app/api/cron/tick/route.ts` (case `ingest.generic`)

**Interfaces:**
- Consumes: `lead_sources` kind 'generic' mit `secret` (Header-Vergleich) und `config`: `{ job_id?: string; fields?: { first_name?: string; last_name?: string; name?: string; phone: string; email?: string; consent?: string }, consent_true_values?: string[] }` — Werte sind Dot-Pfade in den Body (z. B. `"profile.phone.value"`).
- Produces: `getByPath(obj: unknown, path: string): string | null`; `processIngestGeneric(svc, agencyId, payload: { source_id: string; body: Record<string, unknown> })`; events_inbox-Row `{ source: 'generic', external_id: <source_id>:<body.id> | null, payload: { type: 'ingest.generic', source_id, body } }`.

- [ ] **Step 1: Failing Tests** (`ingest-generic.test.ts`) — `getByPath` + Mapping-Funktion `mapGenericFields` testen:

```ts
import { describe, it, expect } from 'vitest';
import { getByPath, mapGenericFields } from '@/lib/workers/ingest-generic';

describe('getByPath', () => {
  it('liest verschachtelte Pfade', () => {
    expect(getByPath({ a: { b: { c: 'x' } } }, 'a.b.c')).toBe('x');
  });
  it('fehlender Pfad → null', () => {
    expect(getByPath({ a: 1 }, 'a.b')).toBeNull();
  });
  it('Zahlen werden zu Strings', () => {
    expect(getByPath({ a: 42 }, 'a')).toBe('42');
  });
});

describe('mapGenericFields', () => {
  const body = { vorname: 'Anna', nachname: 'Muster', tel: '0171 999', mail: 'a@b.de', optin: 'yes' };
  const config = {
    fields: { first_name: 'vorname', last_name: 'nachname', phone: 'tel', email: 'mail', consent: 'optin' },
    consent_true_values: ['yes', 'ja', 'true'],
  };
  it('mappt konfigurierte Felder', () => {
    const r = mapGenericFields(body, config);
    expect(r).toMatchObject({ firstName: 'Anna', lastName: 'Muster', phone: '0171 999', email: 'a@b.de', consentWhatsapp: true });
  });
  it('name-Feld wird gesplittet, wenn first/last fehlen', () => {
    const r = mapGenericFields({ full: 'Max Muster', tel: '1' }, { fields: { name: 'full', phone: 'tel' } });
    expect(r.firstName).toBe('Max');
    expect(r.lastName).toBe('Muster');
  });
  it('consent default false', () => {
    const r = mapGenericFields({ tel: '1' }, { fields: { phone: 'tel' } });
    expect(r.consentWhatsapp).toBe(false);
  });
});
```

- [ ] **Step 2: Tests rot laufen lassen.**

- [ ] **Step 3: Worker implementieren** (`src/lib/workers/ingest-generic.ts`)

```ts
import { SupabaseClient } from '@supabase/supabase-js';
import { ingestApplication } from '@/lib/recruiting/ingest';

export function getByPath(obj: unknown, path: string): string | null {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (cur == null) return null;
  if (typeof cur === 'string') return cur.trim() || null;
  if (typeof cur === 'number') return String(cur);
  return null;
}

export interface GenericConfig {
  job_id?: string;
  fields?: {
    first_name?: string;
    last_name?: string;
    name?: string;
    phone?: string;
    email?: string;
    consent?: string;
  };
  consent_true_values?: string[];
}

export function mapGenericFields(body: Record<string, unknown>, config: GenericConfig) {
  const f = config.fields ?? {};
  let firstName = f.first_name ? getByPath(body, f.first_name) ?? '' : '';
  let lastName = f.last_name ? getByPath(body, f.last_name) ?? '' : '';
  if (!firstName && f.name) {
    const full = getByPath(body, f.name) ?? '';
    const parts = full.split(/\s+/);
    firstName = parts[0] ?? '';
    lastName = parts.slice(1).join(' ');
  }
  const phone = f.phone ? getByPath(body, f.phone) ?? '' : '';
  const email = f.email ? getByPath(body, f.email) : null;
  const trueValues = (config.consent_true_values ?? ['ja', 'yes', 'true', '1']).map((v) => v.toLowerCase());
  const consentRaw = f.consent ? getByPath(body, f.consent) : null;
  const consentWhatsapp = consentRaw != null && trueValues.includes(consentRaw.toLowerCase());
  return { firstName, lastName, phone, email, consentWhatsapp };
}

/** Worker für events_inbox payload.type = 'ingest.generic' (Spec §6). */
export async function processIngestGeneric(
  svc: SupabaseClient,
  agencyId: string | null,
  payload: { source_id: string; body: Record<string, unknown> }
): Promise<void> {
  const { data: source } = await svc
    .from('lead_sources')
    .select('id, agency_id, config, active')
    .eq('id', payload.source_id)
    .single();
  if (!source || !source.active) throw new Error(`ingest.generic: Quelle ${payload.source_id} nicht gefunden/inaktiv`);
  if (agencyId && source.agency_id !== agencyId) throw new Error('ingest.generic: agency mismatch');

  const config = (source.config ?? {}) as GenericConfig;
  const mapped = mapGenericFields(payload.body, config);
  if (!mapped.phone) throw new Error('ingest.generic: Telefonnummer fehlt im Mapping');

  // Job: config.job_id, sonst Default-Job der Agentur
  let jobId = config.job_id ?? null;
  if (!jobId) {
    const { data: defaultJob } = await svc
      .from('jobs')
      .select('id')
      .eq('agency_id', source.agency_id)
      .eq('is_default', true)
      .limit(1)
      .single();
    jobId = defaultJob?.id ?? null;
  }
  if (!jobId) throw new Error('ingest.generic: kein Job zugeordnet');

  const externalId = typeof payload.body.id === 'string' ? payload.body.id : null;
  await ingestApplication(svc, {
    agencyId: source.agency_id,
    jobId,
    firstName: mapped.firstName,
    lastName: mapped.lastName,
    phone: mapped.phone,
    email: mapped.email ?? undefined,
    source: 'generic',
    sourceRef: externalId ? `${source.id}:${externalId}` : undefined,
    consentWhatsapp: mapped.consentWhatsapp,
    consentSource: 'generic',
  });
}
```

- [ ] **Step 4: Route implementieren** (`src/app/api/webhooks/generic/[source_id]/route.ts`)

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { timingSafeEqual } from 'crypto';

/** POST /api/webhooks/generic/{source_id} — externe Formulare/Perspective (Spec §6/§13). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ source_id: string }> }
) {
  const { source_id } = await params;
  if (!isUuid(source_id)) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const svc = createAdminClient();
  const { data: source } = await svc
    .from('lead_sources')
    .select('id, agency_id, secret, active, kind')
    .eq('id', source_id)
    .eq('kind', 'generic')
    .single();
  if (!source || !source.active) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  // Fail-closed: ohne konfiguriertes Secret keine Annahme
  const provided = request.headers.get('x-webhook-secret');
  if (!source.secret || !provided) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const a = Buffer.from(provided);
  const b = Buffer.from(source.secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 });
  }

  const externalId = typeof body.id === 'string' ? `${source.id}:${body.id}` : null;
  const { error } = await svc.from('events_inbox').insert({
    source: 'generic',
    external_id: externalId,
    agency_id: source.agency_id,
    payload: { type: 'ingest.generic', source_id: source.id, body },
  });
  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
    console.error('[generic-webhook] events_inbox insert fehlgeschlagen', error.message);
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Tick verdrahten** — Events-Switch:

```ts
case 'ingest.generic':
  await processIngestGeneric(svc, event.agency_id, payload as unknown as Parameters<typeof processIngestGeneric>[2]);
  break;
```

- [ ] **Step 6: Alle Tests + Build grün.**

- [ ] **Step 7: Commit**

```bash
git add src/app/api/webhooks/generic src/lib/workers/ingest-generic.ts src/lib/workers/__tests__/ingest-generic.test.ts src/app/api/cron/tick/route.ts
git commit -m "feat(sources): generischer Quellen-Webhook mit Secret und ingest.generic-Worker (Phase 5 Task 7)"
```

---

### Task 8: Eingangs-Monitoring im Daily-Cron

**Files:**
- Create: `src/lib/monitoring/ingest-monitor.ts`
- Create: `src/lib/monitoring/__tests__/ingest-monitor.test.ts`
- Modify: `src/app/api/cron/daily/route.ts` (Aufruf anhängen, best effort)

**Interfaces:**
- Consumes: `feed_polls` (Task 1), `applications` (`source`, `created_at`, `agency_id`), `events_inbox`, `createNotificationForAgency`.
- Produces: `runIngestMonitor(svc: SupabaseClient): Promise<{ feedAlerts: number; errorRateAlerts: number }>`; reine Entscheidungsfunktionen `shouldAlertFeed(polls: number, apps: number): boolean` und `shouldAlertErrorRate(failed: number, total: number): boolean`.

Regeln (Spec §5 Monitoring): Alarm, wenn in 24 h Feed-Abrufe stattfanden, aber keine Indeed-Bewerbung ankam; Alarm, wenn Fehlerquote der Ingest-Events (`failed` + `dead` / gesamt, Quellen indeed/meta/generic) über 1 % liegt — nur bei mindestens 20 Events, damit ein Einzelfehler bei kleinem Volumen nicht alarmiert.

- [ ] **Step 1: Failing Tests**

```ts
import { describe, it, expect } from 'vitest';
import { shouldAlertFeed, shouldAlertErrorRate } from '@/lib/monitoring/ingest-monitor';

describe('shouldAlertFeed', () => {
  it('alarmiert bei Polls ohne Bewerbungen', () => expect(shouldAlertFeed(5, 0)).toBe(true));
  it('kein Alarm ohne Polls', () => expect(shouldAlertFeed(0, 0)).toBe(false));
  it('kein Alarm wenn Bewerbungen ankamen', () => expect(shouldAlertFeed(5, 2)).toBe(false));
});

describe('shouldAlertErrorRate', () => {
  it('alarmiert über 1 % bei genug Volumen', () => expect(shouldAlertErrorRate(2, 100)).toBe(true));
  it('kein Alarm unter Mindestvolumen 20', () => expect(shouldAlertErrorRate(1, 10)).toBe(false));
  it('kein Alarm bei exakt 1 %', () => expect(shouldAlertErrorRate(1, 100)).toBe(false));
});
```

- [ ] **Step 2: Tests rot laufen lassen.**

- [ ] **Step 3: Implementieren** (`src/lib/monitoring/ingest-monitor.ts`)

```ts
import { SupabaseClient } from '@supabase/supabase-js';
import { createNotificationForAgency } from '@/lib/notifications/create';

export function shouldAlertFeed(polls: number, apps: number): boolean {
  return polls > 0 && apps === 0;
}

export function shouldAlertErrorRate(failed: number, total: number): boolean {
  return total >= 20 && failed / total > 0.01;
}

/** Täglicher Check der Eingänge (Spec §5 Monitoring). */
export async function runIngestMonitor(svc: SupabaseClient): Promise<{ feedAlerts: number; errorRateAlerts: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let feedAlerts = 0;
  let errorRateAlerts = 0;

  const { data: agencies } = await svc.from('agencies').select('id, name');
  for (const agency of agencies ?? []) {
    // 1. Feed-Abrufe ohne Bewerbungen
    const { count: polls } = await svc
      .from('feed_polls')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agency.id)
      .gte('polled_at', since);
    const { count: apps } = await svc
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agency.id)
      .eq('source', 'indeed')
      .gte('created_at', since);
    if (shouldAlertFeed(polls ?? 0, apps ?? 0)) {
      feedAlerts++;
      await createNotificationForAgency(svc, agency.id, {
        title: 'Indeed-Feed ohne Bewerbungen',
        body: `In den letzten 24 Stunden gab es ${polls} Feed-Abrufe, aber keine Indeed-Bewerbung. Bitte Feed und Freigabestatus prüfen.`,
        type: 'system',
        push_url: '/settings/quellen',
      }).catch((e) => console.error('[ingest-monitor] Notification fehlgeschlagen', e));
    }

    // 2. Fehlerquote der Ingest-Events
    const { count: total } = await svc
      .from('events_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agency.id)
      .in('source', ['indeed', 'meta', 'generic'])
      .gte('received_at', since);
    const { count: failed } = await svc
      .from('events_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agency.id)
      .in('source', ['indeed', 'meta', 'generic'])
      .in('status', ['failed', 'dead'])
      .gte('received_at', since);
    if (shouldAlertErrorRate(failed ?? 0, total ?? 0)) {
      errorRateAlerts++;
      await createNotificationForAgency(svc, agency.id, {
        title: 'Fehlerquote im Bewerbungseingang über 1 %',
        body: `${failed} von ${total} Eingangs-Events der letzten 24 Stunden sind fehlgeschlagen.`,
        type: 'system',
        push_url: '/settings/quellen',
      }).catch((e) => console.error('[ingest-monitor] Notification fehlgeschlagen', e));
    }
  }
  return { feedAlerts, errorRateAlerts };
}
```

Falls `events_inbox` den Status `failed` nicht verwendet (nur `pending`→`dead`), den `.in('status', ...)`-Filter auf `['dead']` plus `attempts > 0 AND status = 'pending'` NICHT umbauen — nur `dead` zählen und im Report vermerken.

- [ ] **Step 4: In `/api/cron/daily/route.ts` einhängen** — am Ende des bestehenden Handlers (Muster der anderen Aufrufe dort übernehmen):

```ts
const { runIngestMonitor } = await import('@/lib/monitoring/ingest-monitor');
await runIngestMonitor(svc).catch((e) => console.error('[cron-daily] ingest-monitor fehlgeschlagen', e));
```

Achtung: prüfen, wie der Daily-Cron seinen Supabase-Client nennt (`svc`/`supabase`) und den vorhandenen verwenden.

- [ ] **Step 5: Alle Tests + Build grün.**

- [ ] **Step 6: Commit**

```bash
git add src/lib/monitoring src/app/api/cron/daily/route.ts
git commit -m "feat(monitoring): täglicher Eingangs-Check für Feed-Abrufe und Fehlerquote (Phase 5 Task 8)"
```

---

### Task 9: UI — Quellen-Verwaltung + indeed_mode-Umschalter

**Files:**
- Create: `src/app/api/lead-sources/route.ts` (GET Liste, POST anlegen)
- Create: `src/app/api/lead-sources/[id]/route.ts` (PATCH)
- Create: `src/app/api/lead-sources/__tests__/lead-sources.test.ts`
- Create: `src/app/(portal)/settings/quellen/page.tsx`
- Create: `src/components/settings/lead-sources-manager.tsx`
- Modify: `src/components/jobs/job-detail.tsx` (indeed_mode-Auswahl)

**Interfaces:**
- Consumes: `lead_sources`, `agencies.indeed_feed_key`, Auth-Kette (Global Constraints), bestehender Job-Update-Pfad in `job-detail.tsx` (dort nachlesen, wie `status` o. Ä. gespeichert wird, und denselben Pfad für `indeed_mode` verwenden — existiert dort bereits ein PATCH auf eine Jobs-API, diese um `indeed_mode` erweitern).
- Produces: GET `/api/lead-sources` → `{ sources: [...], feed: { url: string } }`; POST body `{ kind, name, config?, job_id? }` → erzeugt Quelle, bei kind 'generic' mit `secret = crypto.randomBytes(24).toString('hex')`, Antwort enthält `webhook_url`; PATCH `/api/lead-sources/[id]` body `{ name?, config?, active? }`.

- [ ] **Step 1: Failing API-Tests** — nach dem Muster bestehender API-Tests (z. B. `src/app/api/appointments-recruiting/__tests__/patch.test.ts`: Mocks für `getCurrentUser`, `canWriteRole`, `getEffectiveAgencyId`, Supabase-Client). Fälle: 401 ohne User; 403 ohne Agentur; 403 bei POST ohne Schreibrolle; POST legt Quelle mit Secret an (kind generic); POST validiert kind (400 bei anderem Wert); GET liefert nur Quellen der eigenen Agentur (Query trägt `.eq('agency_id', ...)`); PATCH 404 bei fremder Agentur.

- [ ] **Step 2: Tests rot laufen lassen.**

- [ ] **Step 3: API-Routen implementieren** — Auth-Kette exakt wie in `src/app/api/appointments-recruiting/[id]/route.ts`; zod-Schema:

```ts
const createSchema = z.object({
  kind: z.enum(['meta', 'generic']),
  name: z.string().min(1).max(120),
  config: z.record(z.string(), z.unknown()).optional(),
});
```

GET liefert zusätzlich die Feed-URL: `agencies.slug` + `indeed_feed_key` der eigenen Agentur lesen und `feed.url = ${baseUrl}/api/feeds/indeed/${slug}.xml?key=${indeed_feed_key}` zurückgeben.

- [ ] **Step 4: Tests grün.**

- [ ] **Step 5: UI bauen** — `settings/quellen/page.tsx` (Server-Shell nach Muster von `settings/page.tsx`) rendert `<LeadSourcesManager />` (Client): Liste der Quellen (Name, Art, aktiv-Toggle), „Quelle anlegen"-Formular (Name + Art), je generischer Quelle die Webhook-URL `{baseUrl}/api/webhooks/generic/{id}` mit Kopieren-Button und Hinweis auf den Header `x-webhook-secret` (Secret einmalig nach Anlage anzeigen), je Meta-Quelle ein Textfeld-Paar zum Pflegen von `config.forms` (Formular-ID → Job-Auswahl per Select aus `/api/jobs`-Liste, falls vorhanden — sonst Job-ID-Textfeld) und `config.page_token`; je generischer Quelle zusätzlich die Feldzuordnung `config.fields` (fünf Textfelder für die Dot-Pfade first_name/last_name/phone/email/consent, phone Pflicht) und optional `config.job_id` (Spec §6: Feldzuordnung pro Quelle im UI konfigurierbar). Oben: Indeed-Feed-URL der Agentur mit Kopieren-Button. Buttons `variant="secondary"`, Toasts über `sonner`, deutsche Texte.

- [ ] **Step 6: `job-detail.tsx` erweitern** — Auswahlfeld „Indeed-Modus" mit Optionen `Aus (off)`, `Weiterleitung (redirect)`, `Indeed Apply (apply)` neben der bestehenden Status-Bearbeitung; speichert über denselben Update-Pfad wie die übrigen Job-Felder.

- [ ] **Step 7: Alle Tests + `npx next build` grün.**

- [ ] **Step 8: Commit**

```bash
git add src/app/api/lead-sources "src/app/(portal)/settings/quellen" src/components/settings/lead-sources-manager.tsx src/components/jobs/job-detail.tsx
git commit -m "feat(sources): Quellen-Verwaltung im Portal und Indeed-Modus je Job (Phase 5 Task 9)"
```

---

## Abnahme-Mapping (Spec §16 Phase 5)

| Kriterium | Abgedeckt durch |
| --- | --- |
| Testbewerbung über Indeed-Testtool landet vollständig (Antworten, Lebenslauf, Opt-in) | Tasks 4+5 (events_inbox → ingest.indeed → ingestApplication mit answers origin indeed, resume, consent) |
| Eröffnungsvorlage < 60 s | ingestApplication reiht `bot.open` sofort ein; Tick läuft minütlich |
| Doppelte Zustellung → keine zweite Bewerbung | Unique-Index events_inbox(source, external_id) + applications.source_ref-Idempotenz |
| Ungültige Signatur → 401 | Task 4 (+ Audit-Eintrag) |
| Meta-Testlead landet beim richtigen Job | Task 6 (lead_sources.config.forms) |
| Monitoring der Eingänge | Task 8 |

## Offene Betriebs-Schritte (außerhalb des Codes, nach Abschluss ins Betriebshandbuch)

- `INDEED_APPLY_SECRET` in Vercel setzen (Shared Secret aus dem Indeed-Partnerprozess).
- Indeed-Partner-Anfrage, Feed-URL einreichen, Testbewerbungen, Freigabe abwarten — erst dann `indeed_mode='apply'` für Kundenjobs.
- Je Kunde: Meta-Seiten-Token in `lead_sources.config.page_token` hinterlegen.
