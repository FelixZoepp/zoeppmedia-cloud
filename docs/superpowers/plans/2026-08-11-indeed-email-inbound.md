# Indeed Email-Inbound — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-import Indeed candidates via Resend Inbound Webhook — parse email body + PDF resume via Claude Haiku, create candidates in Kanban with structured data.

**Architecture:** Resend Inbound Webhook sends Indeed notification emails to `POST /api/webhooks/indeed-email`. The handler extracts agency ID from the +tag, parses the email body for contact info, saves PDF attachments to Supabase Storage, extracts text via `pdf-parse`, sends to Claude Haiku for structured extraction, merges all data, and creates a candidate. Every step has a fallback so the candidate is always created.

**Tech Stack:** Next.js 16, Supabase (DB + Storage), `pdf-parse` (PDF text extraction), Anthropic SDK (Claude Haiku for CV parsing), Resend Inbound

## Global Constraints

- Auth: webhook endpoint has NO auth (called by Resend)
- All other patterns follow existing codebase: `createAdminClient()` (sync) for service operations
- Types in `src/lib/types/database.ts`
- German UI copy
- Apple Red components for any UI changes
- Model for CV parsing: `claude-haiku-4-5-20251001`
- No-fail: candidate MUST be created even if PDF/AI fails

---

### Task 1: DB Migration — candidate fields + inbound email log

**Files:**
- Create: `supabase/migrations/20260811000004_indeed_inbound.sql`
- Modify: `src/lib/types/database.ts`

**Interfaces:**
- Consumes: Existing `candidates`, `agencies` tables
- Produces: Extended `Candidate` type with `resume_url`, `location`, `experience_summary`, `last_employer`, `indeed_job_title`. New `InboundEmailLog` type. New `inbound_email_log` table.

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260811000004_indeed_inbound.sql

-- 1. Extend candidates with Indeed/resume fields
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_url TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS experience_summary TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_employer TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS indeed_job_title TEXT;

-- 2. Inbound email log for debugging
CREATE TABLE inbound_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL CHECK (status IN ('processed', 'failed', 'no_agency')),
  error_message TEXT,
  candidate_id UUID REFERENCES candidates(id),
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_inbound_email_log_agency ON inbound_email_log(agency_id);
CREATE INDEX idx_inbound_email_log_status ON inbound_email_log(status);

ALTER TABLE inbound_email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can read email log" ON inbound_email_log FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Service can insert email log" ON inbound_email_log FOR INSERT
  WITH CHECK (true);
```

- [ ] **Step 2: Update TypeScript types**

Add to `Candidate` type in `src/lib/types/database.ts`:
```typescript
resume_url: string | null;
location: string | null;
experience_summary: string | null;
last_employer: string | null;
indeed_job_title: string | null;
```

Add new type:
```typescript
export interface InboundEmailLog {
  id: string;
  agency_id: string | null;
  from_address: string;
  to_address: string;
  subject: string | null;
  status: 'processed' | 'failed' | 'no_agency';
  error_message: string | null;
  candidate_id: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260811000004_indeed_inbound.sql src/lib/types/database.ts
git commit -m "feat: add candidate resume fields + inbound email log table"
```

---

### Task 2: Indeed Email Parser + CV Extractor

**Files:**
- Create: `src/lib/indeed/parse-email.ts`
- Create: `src/lib/indeed/extract-cv.ts`

**Interfaces:**
- Consumes: Anthropic SDK (existing in project), `pdf-parse` (to install)
- Produces: `parseIndeedEmail(body: string, subject: string): ParsedEmail`, `extractCvData(pdfBuffer: Buffer): Promise<CvData>`

- [ ] **Step 1: Install pdf-parse**

```bash
cd ~/zoepp-media-cloud && npm install pdf-parse
```

- [ ] **Step 2: Create `src/lib/indeed/parse-email.ts`**

```typescript
export interface ParsedEmail {
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
}

export function parseIndeedEmail(body: string, subject: string): ParsedEmail {
  const text = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  // Name from subject: "Neue Bewerbung: [Titel] — [Name]" or "New application: [Title] — [Name]"
  let candidateName: string | null = null;
  const subjectMatch = subject.match(/[—–-]\s*(.+)$/);
  if (subjectMatch) {
    candidateName = subjectMatch[1].trim();
  }
  // Fallback: first line of body often contains the name
  if (!candidateName) {
    const nameMatch = text.match(/^(.+?)\s+hat sich/);
    if (nameMatch) candidateName = nameMatch[1].trim();
  }

  // Email: find email addresses, prefer non-indeed ones
  const emails = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/g) || [];
  const realEmail = emails.find(e => !e.includes('indeed.com')) || emails[0] || null;

  // Phone: German phone patterns
  const phoneMatch = text.match(/(?:\+49|0)\s*\d[\d\s/.-]{6,14}\d/);
  const phone = phoneMatch ? phoneMatch[0].replace(/\s+/g, ' ').trim() : null;

  // Job title from subject
  let jobTitle: string | null = null;
  const titleMatch = subject.match(/(?:Bewerbung|application)[:\s]+(.+?)\s*[—–-]/i);
  if (titleMatch) jobTitle = titleMatch[1].trim();

  return { candidateName, email: realEmail, phone, jobTitle };
}

export function extractAgencyIdFromAddress(to: string): string | null {
  // bewerber+abc123@zoeppmedia.de → abc123
  const match = to.match(/bewerber\+([^@]+)@/i);
  return match ? match[1] : null;
}
```

- [ ] **Step 3: Create `src/lib/indeed/extract-cv.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';

export interface CvData {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  experience_summary: string | null;
  last_employer: string | null;
}

const EMPTY_CV: CvData = {
  full_name: null,
  email: null,
  phone: null,
  location: null,
  experience_summary: null,
  last_employer: null,
};

export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const result = await pdfParse(pdfBuffer);
    return result.text || '';
  } catch {
    return '';
  }
}

export async function extractCvData(pdfText: string): Promise<CvData> {
  if (!pdfText || pdfText.length < 20) return EMPTY_CV;

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `Du extrahierst strukturierte Daten aus einem Lebenslauf-Text.
Antworte NUR mit einem JSON-Objekt, keine Erklärung.

Extrahiere:
{
  "full_name": "Vollständiger Name",
  "email": "Email-Adresse oder null",
  "phone": "Telefonnummer oder null",
  "location": "Wohnort/Stadt oder null",
  "experience_summary": "1-2 Sätze über relevante Berufserfahrung",
  "last_employer": "Letzter/aktueller Arbeitgeber oder null"
}

Wenn ein Feld nicht findbar ist, setze null.`,
      messages: [{ role: 'user', content: pdfText.slice(0, 4000) }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock) return EMPTY_CV;

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return EMPTY_CV;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      full_name: parsed.full_name || null,
      email: parsed.email || null,
      phone: parsed.phone || null,
      location: parsed.location || null,
      experience_summary: parsed.experience_summary || null,
      last_employer: parsed.last_employer || null,
    };
  } catch {
    return EMPTY_CV;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/indeed/ package.json package-lock.json
git commit -m "feat: Indeed email parser + Claude Haiku CV data extractor"
```

---

### Task 3: Indeed Inbound Webhook Endpoint

**Files:**
- Create: `src/app/api/webhooks/indeed-email/route.ts`

**Interfaces:**
- Consumes: `parseIndeedEmail()`, `extractAgencyIdFromAddress()` from `src/lib/indeed/parse-email.ts`, `extractTextFromPdf()`, `extractCvData()` from `src/lib/indeed/extract-cv.ts`, `createAdminClient()` from `src/lib/supabase/server.ts`
- Produces: `POST /api/webhooks/indeed-email` — creates candidate, returns `{ ok: true, candidate_id }`

- [ ] **Step 1: Create the webhook route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { parseIndeedEmail, extractAgencyIdFromAddress } from '@/lib/indeed/parse-email';
import { extractTextFromPdf, extractCvData } from '@/lib/indeed/extract-cv';

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  let agencyId: string | null = null;

  try {
    const body = await request.json();
    const to = (body.to || body.headers?.to || '').toString();
    const from = (body.from || body.headers?.from || '').toString();
    const subject = (body.subject || body.headers?.subject || '').toString();
    const htmlBody = body.html || body.text || '';
    const attachments: { filename?: string; content_type?: string; content?: string }[] = body.attachments || [];

    // 1. Extract agency ID from +tag
    agencyId = extractAgencyIdFromAddress(to);
    if (!agencyId) {
      await supabase.from('inbound_email_log').insert({
        from_address: from,
        to_address: to,
        subject,
        status: 'no_agency',
        error_message: 'No agency ID in address tag',
        raw_payload: body,
      });
      return NextResponse.json({ error: 'No agency ID' }, { status: 400 });
    }

    // 2. Validate agency exists
    const { data: agency } = await supabase.from('agencies').select('id').eq('id', agencyId).single();
    if (!agency) {
      await supabase.from('inbound_email_log').insert({
        agency_id: null,
        from_address: from,
        to_address: to,
        subject,
        status: 'no_agency',
        error_message: `Agency ${agencyId} not found`,
        raw_payload: body,
      });
      return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
    }

    // 3. Parse email body
    const parsed = parseIndeedEmail(htmlBody, subject);

    // 4. Handle PDF attachment
    let resumeUrl: string | null = null;
    let cvData = { full_name: null, email: null, phone: null, location: null, experience_summary: null, last_employer: null };

    const pdfAttachment = attachments.find(a =>
      a.content_type?.includes('pdf') || a.filename?.toLowerCase().endsWith('.pdf')
    );

    if (pdfAttachment?.content) {
      const pdfBuffer = Buffer.from(pdfAttachment.content, 'base64');

      // Save PDF to storage
      try {
        const safeName = (parsed.candidateName || 'bewerber').replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '_').slice(0, 50);
        const fileName = `${agencyId}/${Date.now()}-${safeName}.pdf`;

        const { error: uploadError } = await supabase.storage
          .from('candidate-resumes')
          .upload(fileName, pdfBuffer, { contentType: 'application/pdf' });

        if (!uploadError) {
          const { data: urlData } = await supabase.storage
            .from('candidate-resumes')
            .createSignedUrl(fileName, 365 * 24 * 60 * 60); // 1 year
          resumeUrl = urlData?.signedUrl || null;
        }
      } catch {
        // Storage failed — continue without resume URL
      }

      // Extract text from PDF and run Claude
      try {
        const pdfText = await extractTextFromPdf(pdfBuffer);
        if (pdfText.length > 20) {
          cvData = await extractCvData(pdfText);
        }
      } catch {
        // PDF parsing or AI failed — continue with email data only
      }
    }

    // 5. Merge data: CV wins over email-body for overlapping fields
    const finalName = cvData.full_name || parsed.candidateName || 'Indeed-Bewerber';
    const finalEmail = cvData.email || parsed.email || null;
    const finalPhone = cvData.phone || parsed.phone || null;

    // 6. Get first pipeline stage
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .order('sort_order', { ascending: true })
      .limit(1)
      .single();

    if (!firstStage) {
      throw new Error('No pipeline stages configured');
    }

    // 7. Create candidate
    const { data: candidate, error: candidateError } = await supabase
      .from('candidates')
      .insert({
        agency_id: agencyId,
        name: finalName,
        email: finalEmail,
        phone: finalPhone,
        source: 'indeed',
        current_stage_id: firstStage.id,
        resume_url: resumeUrl,
        location: cvData.location,
        experience_summary: cvData.experience_summary,
        last_employer: cvData.last_employer,
        indeed_job_title: parsed.jobTitle,
      })
      .select()
      .single();

    if (candidateError) throw candidateError;

    // 8. Log initial stage
    await supabase.from('candidate_stages').insert({
      candidate_id: candidate.id,
      stage_id: firstStage.id,
    });

    // 9. Log success
    await supabase.from('inbound_email_log').insert({
      agency_id: agencyId,
      from_address: from,
      to_address: to,
      subject,
      status: 'processed',
      candidate_id: candidate.id,
    });

    return NextResponse.json({ ok: true, candidate_id: candidate.id });
  } catch (err) {
    // Final fallback: log the error
    await supabase.from('inbound_email_log').insert({
      agency_id: agencyId,
      from_address: 'unknown',
      to_address: 'unknown',
      subject: null,
      status: 'failed',
      error_message: err instanceof Error ? err.message : 'Unknown error',
    }).catch(() => {});

    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create Supabase Storage bucket**

Document the SQL (apply manually):
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('candidate-resumes', 'candidate-resumes', false);
```

- [ ] **Step 3: Test and commit**

```bash
npx tsc --noEmit
git add src/app/api/webhooks/indeed-email/
git commit -m "feat: Indeed inbound webhook — email parse, PDF extract, candidate create"
```

---

### Task 4: Onboarding + Candidate Detail UI Updates

**Files:**
- Modify: `src/app/(portal)/onboarding/page.tsx`
- Modify: `src/app/(portal)/candidates/[id]/page.tsx`

**Interfaces:**
- Consumes: Extended `Candidate` type with `resume_url`, `location`, `experience_summary`, `last_employer`, `indeed_job_title`
- Produces: Indeed setup block in onboarding Step 5, resume/details display on candidate page

- [ ] **Step 1: Add Indeed setup block to onboarding Step 5**

In `src/app/(portal)/onboarding/page.tsx`, add after the Meta access checkboxes in Step 5:

```tsx
{/* Indeed Integration */}
<div className="mt-8 pt-6 border-t border-gray-200">
  <h3 className="text-base font-semibold text-gray-900 mb-2">Indeed-Bewerbungen automatisch importieren</h3>
  <p className="text-sm text-gray-500 mb-4">
    Damit neue Indeed-Bewerbungen automatisch in deiner Cloud erscheinen, leite die Email-Benachrichtigungen weiter.
  </p>

  <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 mb-4">
    <p className="text-sm text-blue-800 font-medium mb-2">Deine Indeed-Weiterleitungsadresse:</p>
    <div className="flex items-center gap-2">
      <code className="flex-1 px-3 py-2 bg-white rounded-lg text-sm font-mono border border-blue-200 select-all">
        bewerber+{user?.agency_id}@zoeppmedia.de
      </code>
      <Button variant="secondary" size="sm" onClick={() => {
        navigator.clipboard.writeText(`bewerber+${user?.agency_id}@zoeppmedia.de`);
      }}>
        Kopieren
      </Button>
    </div>
  </div>

  <ol className="space-y-2 text-sm text-gray-600">
    <li className="flex gap-2"><span className="font-semibold text-gray-900">1.</span> Öffne Indeed → Konto → Benachrichtigungen</li>
    <li className="flex gap-2"><span className="font-semibold text-gray-900">2.</span> Aktiviere Email-Weiterleitung für neue Bewerbungen</li>
    <li className="flex gap-2"><span className="font-semibold text-gray-900">3.</span> Trage die obige Adresse als Weiterleitungsziel ein</li>
  </ol>

  <label className="flex items-center gap-3 mt-4 cursor-pointer">
    <input
      type="checkbox"
      checked={form.meta_access_steps.indeed_forwarding || false}
      onChange={(e) => setForm(f => ({
        ...f,
        meta_access_steps: { ...f.meta_access_steps, indeed_forwarding: e.target.checked }
      }))}
      className="w-5 h-5 rounded accent-red-500"
    />
    <span className="text-sm font-medium text-gray-900">Indeed-Weiterleitung eingerichtet</span>
  </label>
</div>
```

- [ ] **Step 2: Add resume + details to candidate page**

In `src/app/(portal)/candidates/[id]/page.tsx`, add a new section after the existing candidate info:

```tsx
{/* Indeed Details + Resume */}
{(candidate.resume_url || candidate.location || candidate.experience_summary || candidate.last_employer || candidate.indeed_job_title) && (
  <Card>
    <h3 className="font-semibold text-gray-900 mb-3">Bewerber-Details</h3>
    <div className="space-y-2">
      {candidate.indeed_job_title && (
        <div className="flex items-center gap-2">
          <Badge tone="softAccent">Indeed</Badge>
          <span className="text-sm text-gray-700">{candidate.indeed_job_title}</span>
        </div>
      )}
      {candidate.location && (
        <p className="text-sm text-gray-600"><span className="font-medium">Wohnort:</span> {candidate.location}</p>
      )}
      {candidate.last_employer && (
        <p className="text-sm text-gray-600"><span className="font-medium">Letzter AG:</span> {candidate.last_employer}</p>
      )}
      {candidate.experience_summary && (
        <p className="text-sm text-gray-600"><span className="font-medium">Erfahrung:</span> {candidate.experience_summary}</p>
      )}
      {candidate.resume_url && (
        <a
          href={candidate.resume_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition"
        >
          Lebenslauf anzeigen (PDF)
        </a>
      )}
    </div>
  </Card>
)}
```

- [ ] **Step 3: Test and commit**

```bash
npx tsc --noEmit
git add src/app/\(portal\)/onboarding/page.tsx src/app/\(portal\)/candidates/\[id\]/page.tsx
git commit -m "feat: Indeed setup in onboarding + resume/details on candidate page"
```

---

## Execution Order

All 4 tasks are sequential: Task 1 (migration) → Task 2 (parsers) → Task 3 (webhook) → Task 4 (UI).
