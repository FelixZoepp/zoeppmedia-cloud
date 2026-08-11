# End-to-End Fulfillment System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the complete flow from client onboarding through AI-powered fulfillment to campaign launch with real API integrations (Claude, Meta Marketing, Perspective MCP), call-tracking, extended approval workflow, and live reporting.

**Architecture:** Extend existing Next.js 16 App Router + Supabase project. Add real Claude API calls to replace placeholder strings, Meta Marketing API for ad upload/publishing/insights, Perspective MCP for funnel creation. New call-tracking system on candidate detail pages. Extended content approval flow (draft → internal → client → deployed). All new features use existing Apple Red design system components.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Supabase (DB + Auth + Storage), Anthropic SDK (`@anthropic-ai/sdk`), Meta Marketing API v21.0, Perspective MCP (existing), Recharts (existing), lucide-react (existing)

## Global Constraints

- No new UI libraries — use existing Apple Red components (`Button`, `Badge`, `Card`, `Modal`, `Input`, `Select`, `SegmentedControl`, `PageHeader`, `Sidebar`)
- All API routes: auth-check via `getCurrentUser()` from `src/lib/auth.ts`, role-check with `isInternal()` / `isAgency()`
- Supabase client: `createClient()` for browser, `createServerClient()` for API routes
- Types in `src/lib/types/database.ts`
- Inter Tight font, Apple Red color tokens, lucide-react icons
- German UI copy throughout
- Model for all AI generation: `claude-sonnet-4-6`

---

### Task 1: Supabase Migration — call_logs + content status extension + agency meta fields

**Files:**
- Create: `supabase/migrations/20260811000001_call_logs_meta_fields.sql`
- Modify: `src/lib/types/database.ts`

**Interfaces:**
- Consumes: Existing `candidates`, `agencies`, `users`, `content_library` tables
- Produces: `call_logs` table, extended `content_library.status` values, `agencies.meta_ad_account_id` + `agencies.meta_page_id` columns, `CallLog` and updated `ContentLibraryItem` + `Agency` types

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260811000001_call_logs_meta_fields.sql

-- 1. Call logs table
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  result TEXT NOT NULL CHECK (result IN (
    'termin_vereinbart', 'kein_interesse', 'nicht_erreicht',
    'falsche_nummer', 'rueckruf', 'sonstiges'
  )),
  notes TEXT,
  next_step TEXT CHECK (next_step IN (
    'erneut_anrufen', 'termin_bestaetigen', 'absage', 'warten'
  )),
  next_contact_date DATE,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_call_logs_candidate ON call_logs(candidate_id);
CREATE INDEX idx_call_logs_agency ON call_logs(agency_id);
CREATE INDEX idx_call_logs_created ON call_logs(created_at DESC);

-- RLS
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can read own call logs"
  ON call_logs FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Agency members can insert own call logs"
  ON call_logs FOR INSERT
  WITH CHECK (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Internal users can read all call logs"
  ON call_logs FOR SELECT
  USING (get_user_role() IN ('admin', 'employee'));

-- 2. Extend content_library status to support full approval flow
-- Drop and recreate the CHECK constraint
ALTER TABLE content_library DROP CONSTRAINT IF EXISTS content_library_status_check;
ALTER TABLE content_library ADD CONSTRAINT content_library_status_check
  CHECK (status IN ('draft', 'internal_review', 'approved_internal', 'client_review', 'approved', 'changes_requested', 'deployed', 'archived'));

-- Add client feedback field
ALTER TABLE content_library ADD COLUMN IF NOT EXISTS client_feedback TEXT;

-- Migrate old status values
UPDATE content_library SET status = 'approved_internal' WHERE status = 'pending_review';

-- 3. Add Meta fields to agencies
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS meta_ad_account_id TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS meta_page_id TEXT;

-- 4. Add onboarding meta access steps
ALTER TABLE onboarding_submissions ADD COLUMN IF NOT EXISTS meta_access_steps JSONB DEFAULT '{}';
```

- [ ] **Step 2: Update TypeScript types in `src/lib/types/database.ts`**

Add `CallLog` type after the `ReportSnapshot` interface:

```typescript
// Call Tracking
export type CallResult = 'termin_vereinbart' | 'kein_interesse' | 'nicht_erreicht' | 'falsche_nummer' | 'rueckruf' | 'sonstiges';
export type CallNextStep = 'erneut_anrufen' | 'termin_bestaetigen' | 'absage' | 'warten';

export interface CallLog {
  id: string;
  candidate_id: string;
  agency_id: string;
  user_id: string;
  result: CallResult;
  notes: string | null;
  next_step: CallNextStep | null;
  next_contact_date: string | null;
  duration_seconds: number | null;
  created_at: string;
}
```

Update `Agency` type — add two fields:

```typescript
export type Agency = {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  created_at: string;
};
```

Update `ContentLibraryItem.status`:

```typescript
status: 'draft' | 'internal_review' | 'approved_internal' | 'client_review' | 'approved' | 'changes_requested' | 'deployed' | 'archived';
```

Add `client_feedback` to `ContentLibraryItem`:

```typescript
client_feedback: string | null;
```

- [ ] **Step 3: Apply migration to Supabase**

Run: `npx supabase db push` or apply via Supabase dashboard SQL editor for project `qfzqoxeocyuqfreihiok`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260811000001_call_logs_meta_fields.sql src/lib/types/database.ts
git commit -m "feat: add call_logs table, extend content status, add meta fields to agencies"
```

---

### Task 2: Claude API Integration — Real AI Generation

**Files:**
- Modify: `src/app/api/ai/generate/route.ts`
- Modify: `src/app/api/ai/chat/route.ts`
- Create: `src/lib/ai/claude.ts`
- Modify: `package.json` (add `@anthropic-ai/sdk`)

**Interfaces:**
- Consumes: `OnboardingSubmission` from DB, `getCurrentUser()` from `src/lib/auth.ts`
- Produces: `generateContent(type, context): Promise<string>` and `chatWithClaude(messages, systemPrompt): Promise<string>` in `src/lib/ai/claude.ts`

- [ ] **Step 1: Install Anthropic SDK**

```bash
cd ~/zoepp-media-cloud && npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Create `src/lib/ai/claude.ts` helper**

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export type ContentType = 'ad_copy' | 'phone_script' | 'video_script' | 'funnel_text' | 'job_posting' | 'creative_brief';

export interface OnboardingContext {
  company_name: string | null;
  industry: string | null;
  region: string | null;
  employee_count: string | null;
  hiring_target: number | null;
  hiring_timeframe: string | null;
  experience_required: string | null;
  compensation_model: string | null;
  usps: string | null;
  primary_color: string | null;
}

function buildSystemPrompt(type: ContentType, ctx: OnboardingContext): string {
  const base = `Du bist ein Experte für D2D-Recruiting und Personalmarketing. Du erstellst Content für die Firma "${ctx.company_name || 'Unbekannt'}" in der Branche ${ctx.industry || 'D2D-Vertrieb'}, Region ${ctx.region || 'Deutschland'}.

Kontext:
- Aktuelle Mitarbeiter: ${ctx.employee_count || 'k.A.'}
- Einstellungsziel: ${ctx.hiring_target || 'k.A.'} Mitarbeiter in ${ctx.hiring_timeframe || 'k.A.'}
- Erfahrung: ${ctx.experience_required || 'Quereinsteiger willkommen'}
- Vergütung: ${ctx.compensation_model || 'k.A.'}
- USPs: ${ctx.usps || 'k.A.'}`;

  const typePrompts: Record<ContentType, string> = {
    ad_copy: `${base}

Erstelle Facebook/Instagram Recruiting-Anzeigentexte. Erstelle 3 Varianten:
1. Kurz (< 125 Zeichen) — Hook für Feed
2. Mittel (< 250 Zeichen) — Standard Ad Text
3. Lang (< 500 Zeichen) — Detaillierte Anzeige

Jede Variante mit: Headline, Primary Text, Description, CTA-Vorschlag.
Tonalität: Direkt, motivierend, keine Floskeln. Spreche Quereinsteiger an.`,

    phone_script: `${base}

Erstelle ein Telefon-Skript für das Nachfassen von Bewerbern. Struktur:
1. Begrüßung (mit Firmenname)
2. Grund des Anrufs
3. Kurze Vorstellung der Position
4. Qualifizierende Fragen (3-4)
5. Terminvereinbarung
6. Verabschiedung

Tonalität: Freundlich, professionell, nicht aufdringlich. Inklusive Einwandbehandlung für "Kein Interesse" und "Keine Zeit".`,

    video_script: `${base}

Erstelle ein Skript für ein 60-90 Sekunden Recruiting-Video. Struktur:
1. Hook (erste 3 Sekunden)
2. Problem/Situation ansprechen
3. Lösung/Jobangebot vorstellen
4. 3 Key Benefits
5. Social Proof (Teamgröße, Erfolge)
6. Call-to-Action

Tonalität: Authentisch, energisch, wie ein echter Mitarbeiter spricht.`,

    job_posting: `${base}

Erstelle eine Indeed-Stellenanzeige. Struktur:
- Stellentitel (SEO-optimiert)
- Einleitung (2-3 Sätze, Hook)
- Deine Aufgaben (5-6 Punkte)
- Dein Profil (4-5 Punkte, Quereinsteiger willkommen betonen)
- Wir bieten (6-8 Benefits)
- Gehalt/Provision transparent

Tonalität: Modern, direkt, Du-Ansprache.`,

    funnel_text: `${base}

Erstelle Texte für eine Recruiting-Landingpage (Perspective Funnel). Struktur:
- Headline (max 8 Wörter, Aufmerksamkeit)
- Subheadline (1 Satz, Nutzenversprechen)
- 3 Benefit-Blöcke (Icon-Titel + 1 Satz)
- Testimonial-Platzhalter
- CTA-Button Text
- Formular-Überschrift
- Dankeseite-Text

Tonalität: Klar, motivierend, conversion-optimiert.`,

    creative_brief: `${base}

Erstelle ein Creative-Brief für Recruiting-Anzeigenbilder. Beschreibe:
- 3 Bildkonzepte mit Beschreibung (was ist zu sehen, Stimmung, Farben)
- Text-Overlays pro Bild (Headline + Subline)
- Empfohlene Primärfarbe: ${ctx.primary_color || '#E0354B'}
- Format-Empfehlungen (1080x1080 Feed, 1080x1920 Story)
- Do's und Don'ts für D2D-Recruiting Creatives`,
  };

  return typePrompts[type] || base;
}

export async function generateContent(
  type: ContentType,
  context: OnboardingContext,
  previousVersion?: string,
  feedback?: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(type, context);

  let userMessage = `Generiere den Content jetzt.`;
  if (previousVersion && feedback) {
    userMessage = `Hier ist die vorherige Version:\n\n${previousVersion}\n\nFeedback: ${feedback}\n\nBitte überarbeite den Content basierend auf dem Feedback.`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock?.text || '';
}

export async function chatWithClaude(
  messages: { role: 'user' | 'assistant'; content: string }[],
  systemPrompt: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock?.text || '';
}
```

- [ ] **Step 3: Wire up `/api/ai/generate/route.ts`**

Replace the placeholder section. Find the line:
```typescript
// For now, return a placeholder. In production, this would call Claude API.
const generatedContent = `[AI-generierter ${type} Content]\n\n...`;
```

Replace with:
```typescript
import { generateContent as callClaude, ContentType, OnboardingContext } from '@/lib/ai/claude';

// ... inside the POST handler, after fetching onboarding data:

const aiContext: OnboardingContext = {
  company_name: onboarding?.company_name ?? null,
  industry: onboarding?.industry ?? null,
  region: onboarding?.region ?? null,
  employee_count: onboarding?.employee_count ?? null,
  hiring_target: onboarding?.hiring_target ?? null,
  hiring_timeframe: onboarding?.hiring_timeframe ?? null,
  experience_required: onboarding?.experience_required ?? null,
  compensation_model: onboarding?.compensation_model ?? null,
  usps: onboarding?.usps ?? null,
  primary_color: onboarding?.primary_color ?? null,
};

const contentTypeMap: Record<string, ContentType> = {
  ad_copy: 'ad_copy',
  script: 'phone_script',
  funnel_text: 'funnel_text',
  video_script: 'video_script',
  job_posting: 'job_posting',
  creative_brief: 'creative_brief',
};

const aiType = contentTypeMap[type] || 'ad_copy';
const generatedContent = await callClaude(aiType, aiContext, context?.previousVersion, context?.feedback);
```

Also add `video_script`, `job_posting`, and `creative_brief` to the allowed types check at the top of the route.

- [ ] **Step 4: Wire up `/api/ai/chat/route.ts`**

Replace the placeholder section. Find:
```typescript
// Placeholder AI response (ready for Claude API)
const aiResponse = `Basierend auf dem Kontext für ${...}:\n\nHier würde die AI-Antwort stehen.`;
```

Replace with:
```typescript
import { chatWithClaude, OnboardingContext } from '@/lib/ai/claude';
import { buildSystemPrompt } from '@/lib/ai/claude';

// ... inside the POST handler, after fetching messages and onboarding:

const aiContext: OnboardingContext = {
  company_name: onboarding?.company_name ?? null,
  industry: onboarding?.industry ?? null,
  region: onboarding?.region ?? null,
  employee_count: onboarding?.employee_count ?? null,
  hiring_target: onboarding?.hiring_target ?? null,
  hiring_timeframe: onboarding?.hiring_timeframe ?? null,
  experience_required: onboarding?.experience_required ?? null,
  compensation_model: onboarding?.compensation_model ?? null,
  usps: onboarding?.usps ?? null,
  primary_color: onboarding?.primary_color ?? null,
};

// Load conversation history
const { data: history } = await supabase
  .from('ai_messages')
  .select('role, content')
  .eq('conversation_id', conversationId)
  .order('created_at', { ascending: true });

const systemPrompt = `Du bist ein hilfreicher Assistent für D2D-Recruiting-Marketing. Du hilfst bei der Erstellung und Verfeinerung von Recruiting-Content.

Kundenkontext:
- Firma: ${aiContext.company_name || 'Unbekannt'}
- Branche: ${aiContext.industry || 'D2D-Vertrieb'}
- Region: ${aiContext.region || 'Deutschland'}
- USPs: ${aiContext.usps || 'k.A.'}
- Einstellungsziel: ${aiContext.hiring_target || 'k.A.'} in ${aiContext.hiring_timeframe || 'k.A.'}

Antworte immer auf Deutsch. Sei direkt und praxisorientiert.`;

const aiResponse = await chatWithClaude(
  (history || []).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  systemPrompt
);
```

Note: Export `buildSystemPrompt` from `claude.ts` if needed for the chat route, or construct the system prompt inline as shown.

- [ ] **Step 5: Add `ANTHROPIC_API_KEY` to environment**

```bash
# Add to .env.local
echo "ANTHROPIC_API_KEY=sk-ant-..." >> ~/zoepp-media-cloud/.env.local

# Add to Vercel
cd ~/zoepp-media-cloud && npx vercel env add ANTHROPIC_API_KEY
```

- [ ] **Step 6: Test locally**

```bash
cd ~/zoepp-media-cloud && npm run dev
```

Test via curl or browser:
- Navigate to AI Tools page, select an agency, type a message → should get real Claude response
- Navigate to a client's fulfillment page, click "Generieren" on an ad_copy task → should generate real content

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai/claude.ts src/app/api/ai/generate/route.ts src/app/api/ai/chat/route.ts package.json package-lock.json
git commit -m "feat: wire Claude API for AI generation and chat — replace placeholder strings"
```

---

### Task 3: Onboarding Extension — Logo Upload + Meta Access Step

**Files:**
- Modify: `src/app/(portal)/onboarding/page.tsx`
- Modify: `src/app/api/onboarding/route.ts`
- Create: `src/components/file-upload.tsx`

**Interfaces:**
- Consumes: `createClient()` for Supabase Storage, existing onboarding form state
- Produces: `FileUpload` component (reusable), logo_url + team_photos saved to `onboarding_submissions`, meta_access_steps JSONB

- [ ] **Step 1: Create `src/components/file-upload.tsx`**

```tsx
'use client';

import { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui';

interface FileUploadProps {
  bucket: string;
  path: string;
  accept?: string;
  maxSizeMB?: number;
  maxFiles?: number;
  value: string[];
  onChange: (urls: string[]) => void;
  label?: string;
}

export function FileUpload({
  bucket,
  path,
  accept = 'image/png,image/jpeg,image/svg+xml',
  maxSizeMB = 5,
  maxFiles = 1,
  value,
  onChange,
  label,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (value.length + files.length > maxFiles) {
      setError(`Maximal ${maxFiles} Datei${maxFiles > 1 ? 'en' : ''}`);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const newUrls: string[] = [];
      for (const file of files) {
        if (file.size > maxSizeMB * 1024 * 1024) {
          setError(`${file.name} ist zu groß (max ${maxSizeMB}MB)`);
          continue;
        }
        const ext = file.name.split('.').pop();
        const fileName = `${path}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
        newUrls.push(urlData.publicUrl);
      }
      onChange([...value, ...newUrls]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleRemove(url: string) {
    onChange(value.filter(u => u !== url));
  }

  return (
    <div className="space-y-3">
      {label && <label className="block text-sm font-semibold text-gray-800">{label}</label>}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {value.map(url => (
            <div key={url} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemove(url)}
                className="absolute top-1 right-1 p-0.5 bg-white/90 rounded-full opacity-0 group-hover:opacity-100 transition"
              >
                <X className="w-3.5 h-3.5 text-gray-600" />
              </button>
            </div>
          ))}
        </div>
      )}

      {value.length < maxFiles && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-red-200 hover:text-red-500 transition"
        >
          {uploading ? (
            <span className="animate-pulse">Hochladen...</span>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              {maxFiles > 1 ? 'Dateien hochladen' : 'Datei hochladen'}
            </>
          )}
        </button>
      )}

      <input ref={inputRef} type="file" accept={accept} multiple={maxFiles > 1} onChange={handleUpload} className="hidden" />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Extend onboarding page — add logo upload to Step 3 and new Step 5**

In `src/app/(portal)/onboarding/page.tsx`:

Add to form state:
```typescript
const [form, setForm] = useState({
  // ... existing fields ...
  logo_url: '',
  team_photos: [] as string[],
  meta_access_steps: {
    business_manager: false,
    partner_added: false,
    ad_account_shared: false,
    pixel_shared: false,
    page_shared: false,
  },
});
```

Update total steps from 4 to 5.

Add to Step 3 (before the USPs textarea):
```tsx
<FileUpload
  bucket="onboarding-assets"
  path={`agencies/${user?.agency_id}/logo`}
  accept="image/png,image/jpeg,image/svg+xml"
  maxSizeMB={5}
  maxFiles={1}
  value={form.logo_url ? [form.logo_url] : []}
  onChange={(urls) => setForm(f => ({ ...f, logo_url: urls[0] || '' }))}
  label="Logo hochladen"
/>

<FileUpload
  bucket="onboarding-assets"
  path={`agencies/${user?.agency_id}/photos`}
  accept="image/png,image/jpeg"
  maxSizeMB={5}
  maxFiles={10}
  value={form.team_photos}
  onChange={(urls) => setForm(f => ({ ...f, team_photos: urls }))}
  label="Team-Fotos (optional)"
/>
```

Add Step 5 — Meta-Zugang:
```tsx
{step === 5 && (
  <div className="space-y-5">
    <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
      <p className="text-sm text-blue-800 font-medium">
        Damit wir Anzeigen in deinem Namen schalten können, brauchen wir Zugang zu deinem Meta Business Manager.
        Folge den Schritten unten — dauert ca. 5 Minuten.
      </p>
    </div>

    {[
      { key: 'business_manager', title: '1. Business Manager öffnen', desc: 'Gehe zu business.facebook.com und logge dich ein.' },
      { key: 'partner_added', title: '2. Partner hinzufügen', desc: 'Unter Einstellungen → Geschäftspartner → "Hinzufügen" klicken. Unsere Business-ID: XXXXXXXXXX' },
      { key: 'ad_account_shared', title: '3. Werbekonto freigeben', desc: 'Wähle dein Werbekonto aus und gib uns die Berechtigung "Anzeigen verwalten".' },
      { key: 'pixel_shared', title: '4. Pixel teilen (falls vorhanden)', desc: 'Falls du einen Meta Pixel hast, teile ihn ebenfalls mit uns.' },
      { key: 'page_shared', title: '5. Facebook-Seite freigeben', desc: 'Damit wir Anzeigen im Namen deiner Seite schalten können.' },
    ].map(step => (
      <label key={step.key} className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 hover:border-red-200 transition cursor-pointer">
        <input
          type="checkbox"
          checked={form.meta_access_steps[step.key as keyof typeof form.meta_access_steps]}
          onChange={(e) => setForm(f => ({
            ...f,
            meta_access_steps: { ...f.meta_access_steps, [step.key]: e.target.checked }
          }))}
          className="mt-0.5 w-5 h-5 rounded accent-red-500"
        />
        <div>
          <p className="font-semibold text-gray-900">{step.title}</p>
          <p className="text-sm text-gray-500 mt-0.5">{step.desc}</p>
        </div>
      </label>
    ))}
  </div>
)}
```

- [ ] **Step 3: Update `/api/onboarding/route.ts` to save new fields**

Add `logo_url`, `team_photos`, `meta_access_steps` to the INSERT statement. These fields already exist in the DB (or will after migration).

- [ ] **Step 4: Create Supabase Storage bucket**

Via Supabase dashboard or SQL:
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('onboarding-assets', 'onboarding-assets', true);

CREATE POLICY "Agency members can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'onboarding-assets' AND (storage.foldername(name))[2] = (SELECT agency_id::text FROM users WHERE id = auth.uid()));

CREATE POLICY "Anyone can read onboarding assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'onboarding-assets');
```

- [ ] **Step 5: Test locally**

Navigate to `/onboarding`, go through all 5 steps. Verify:
- Logo upload works and shows preview
- Team photos upload (multiple) works
- Step 5 checkboxes persist
- Form submits successfully with all new fields

- [ ] **Step 6: Commit**

```bash
git add src/components/file-upload.tsx src/app/\(portal\)/onboarding/page.tsx src/app/api/onboarding/route.ts
git commit -m "feat: extend onboarding with logo upload, team photos, and Meta access step"
```

---

### Task 4: Extended Approval Flow — Content Library Updates

**Files:**
- Modify: `src/app/(internal)/clients/[id]/library/page.tsx`
- Modify: `src/app/api/library/[id]/route.ts`
- Modify: `src/app/(portal)/status/page.tsx` (or create client-facing content view)

**Interfaces:**
- Consumes: Updated `ContentLibraryItem` type with new status values
- Produces: Full approval flow UI for Mitarbeiter (internal review → approved_internal) and Kunde (client_review → approved/changes_requested)

- [ ] **Step 1: Update library page status badges**

In `src/app/(internal)/clients/[id]/library/page.tsx`, update the `statusConfig` map:

```typescript
const statusConfig: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Entwurf', tone: 'neutral' },
  internal_review: { label: 'Interne Prüfung', tone: 'outline' },
  approved_internal: { label: 'Intern freigegeben', tone: 'softAccent' },
  client_review: { label: 'Beim Kunden', tone: 'accent' },
  approved: { label: 'Freigegeben', tone: 'success' },
  changes_requested: { label: 'Änderungen', tone: 'neutral' },
  deployed: { label: 'Live', tone: 'success' },
  archived: { label: 'Archiviert', tone: 'neutral' },
};
```

- [ ] **Step 2: Add approval action buttons for Mitarbeiter**

Add new action buttons per status:
- `draft` → "Intern freigeben" button (sets `internal_review`)
- `internal_review` → "Für Kunden freigeben" button (sets `approved_internal`)
- `changes_requested` → "Überarbeitet — erneut freigeben" button (sets `approved_internal`)

```tsx
{item.status === 'draft' && (
  <Button size="sm" variant="soft" onClick={() => updateStatus(item.id, 'internal_review')}>
    Zur Prüfung
  </Button>
)}
{item.status === 'internal_review' && (
  <Button size="sm" variant="primary" onClick={() => updateStatus(item.id, 'approved_internal')}>
    Für Kunden freigeben
  </Button>
)}
{item.status === 'changes_requested' && (
  <Button size="sm" variant="soft" onClick={() => updateStatus(item.id, 'approved_internal')}>
    Erneut freigeben
  </Button>
)}
```

- [ ] **Step 3: Update API route for new status transitions**

In `src/app/api/library/[id]/route.ts`, update the PATCH handler to log all transitions to `approval_log`:

```typescript
const validTransitions: Record<string, string[]> = {
  draft: ['internal_review'],
  internal_review: ['approved_internal', 'draft'],
  approved_internal: ['client_review'],
  client_review: ['approved', 'changes_requested'],
  approved: ['deployed'],
  changes_requested: ['internal_review', 'approved_internal'],
  deployed: ['archived'],
};

// Validate transition
if (currentStatus && status) {
  const allowed = validTransitions[currentStatus] || [];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: 'Invalid status transition' }, { status: 400 });
  }
}
```

- [ ] **Step 4: Create client-facing content review on `/status` page**

The client should see content items with status `approved_internal` or later. Add a "Freigaben" section to the existing `/status` page or create a dedicated route.

On the portal side, the client sees items at `approved_internal` and can:
- **Freigeben** → sets `client_review` then `approved` (or just `approved` directly)
- **Änderungen anfordern** → opens feedback modal, sets `changes_requested` with `client_feedback`

Add to the client portal — either extend `/status` or add content items to the existing dashboard.

- [ ] **Step 5: Test the full flow**

1. As Mitarbeiter: create content → mark "Zur Prüfung" → "Für Kunden freigeben"
2. As Kunde: see content appear → "Freigeben" or "Änderungen anfordern"
3. If changes: Mitarbeiter sees it back, edits, re-submits
4. Verify `approval_log` entries are created

- [ ] **Step 6: Commit**

```bash
git add src/app/\(internal\)/clients/\[id\]/library/page.tsx src/app/api/library/\[id\]/route.ts src/app/\(portal\)/status/page.tsx
git commit -m "feat: full approval flow — draft → internal → client → deployed"
```

---

### Task 5: Call-Tracking System

**Files:**
- Create: `src/app/api/candidates/[id]/calls/route.ts`
- Modify: `src/app/(portal)/candidates/[id]/page.tsx`
- Create: `src/components/call-tracker.tsx`

**Interfaces:**
- Consumes: `CallLog`, `CallResult`, `CallNextStep` from `database.ts`, `ContentLibraryItem` (phone_script) for script display
- Produces: `POST /api/candidates/[id]/calls` → creates call log, `GET /api/candidates/[id]/calls` → returns call logs

- [ ] **Step 1: Create API route `src/app/api/candidates/[id]/calls/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const supabase = await createServerClient();

  // Get candidate to verify agency ownership
  const { data: candidate } = await supabase
    .from('candidates')
    .select('agency_id')
    .eq('id', id)
    .single();

  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('call_logs')
    .insert({
      candidate_id: id,
      agency_id: candidate.agency_id,
      user_id: user.id,
      result: body.result,
      notes: body.notes || null,
      next_step: body.next_step || null,
      next_contact_date: body.next_contact_date || null,
      duration_seconds: body.duration_seconds || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create `src/components/call-tracker.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Phone, Clock, ChevronRight } from 'lucide-react';
import { Button, Badge, Card, Input, Select } from '@/components/ui';
import type { CallLog, CallResult, CallNextStep } from '@/lib/types/database';

const resultOptions: { value: CallResult; label: string }[] = [
  { value: 'termin_vereinbart', label: 'Termin vereinbart' },
  { value: 'kein_interesse', label: 'Kein Interesse' },
  { value: 'nicht_erreicht', label: 'Mailbox / Nicht erreicht' },
  { value: 'falsche_nummer', label: 'Falsche Nummer' },
  { value: 'rueckruf', label: 'Rückruf gewünscht' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

const nextStepOptions: { value: CallNextStep; label: string }[] = [
  { value: 'erneut_anrufen', label: 'Erneut anrufen' },
  { value: 'termin_bestaetigen', label: 'Termin bestätigen' },
  { value: 'absage', label: 'Absage' },
  { value: 'warten', label: 'Warten' },
];

const resultBadge: Record<CallResult, { label: string; tone: string }> = {
  termin_vereinbart: { label: 'Termin', tone: 'success' },
  kein_interesse: { label: 'Kein Interesse', tone: 'neutral' },
  nicht_erreicht: { label: 'Nicht erreicht', tone: 'outline' },
  falsche_nummer: { label: 'Falsche Nr.', tone: 'neutral' },
  rueckruf: { label: 'Rückruf', tone: 'softAccent' },
  sonstiges: { label: 'Sonstiges', tone: 'neutral' },
};

interface CallTrackerProps {
  candidateId: string;
  candidatePhone: string | null;
  callLogs: CallLog[];
  script: string | null;
  onLogCreated: (log: CallLog) => void;
}

export function CallTracker({ candidateId, candidatePhone, callLogs, script, onLogCreated }: CallTrackerProps) {
  const [result, setResult] = useState<CallResult | ''>('');
  const [notes, setNotes] = useState('');
  const [nextStep, setNextStep] = useState<CallNextStep | ''>('');
  const [nextDate, setNextDate] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!result) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result,
          notes: notes || null,
          next_step: nextStep || null,
          next_contact_date: nextDate || null,
        }),
      });
      if (res.ok) {
        const log = await res.json();
        onLogCreated(log);
        setResult('');
        setNotes('');
        setNextStep('');
        setNextDate('');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Script Panel */}
      <Card>
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Phone className="w-4 h-4 text-red-500" />
          Telefon-Skript
        </h3>
        {candidatePhone && (
          <a href={`tel:${candidatePhone}`} className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition">
            <Phone className="w-3.5 h-3.5" />
            {candidatePhone}
          </a>
        )}
        {script ? (
          <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">{script}</div>
        ) : (
          <p className="text-sm text-gray-400">Noch kein Skript generiert. Bitte wende dich an deinen Ansprechpartner.</p>
        )}
      </Card>

      {/* Log Form + History */}
      <div className="space-y-4">
        <Card>
          <h3 className="font-semibold text-gray-900 mb-3">Anruf protokollieren</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {resultOptions.map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm cursor-pointer transition ${
                    result === opt.value ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input type="radio" name="result" value={opt.value} checked={result === opt.value} onChange={() => setResult(opt.value)} className="sr-only" />
                  {opt.label}
                </label>
              ))}
            </div>

            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notiz..."
              rows={2}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-red-300 focus:ring-1 focus:ring-red-200 outline-none"
            />

            <div className="flex gap-3">
              <Select value={nextStep} onChange={e => setNextStep(e.target.value as CallNextStep)}>
                <option value="">Nächster Schritt...</option>
                {nextStepOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            </div>

            <Button type="submit" variant="primary" disabled={!result || saving} className="w-full">
              {saving ? 'Speichern...' : 'Protokoll speichern'}
            </Button>
          </form>
        </Card>

        {/* Call History */}
        {callLogs.length > 0 && (
          <Card variant="inset">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Anruf-Verlauf ({callLogs.length})
            </h4>
            <div className="space-y-2">
              {callLogs.map(log => (
                <div key={log.id} className="flex items-start justify-between p-2.5 rounded-lg bg-white border border-gray-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone={resultBadge[log.result]?.tone as 'success' | 'neutral' | 'outline' | 'softAccent' || 'neutral'}>
                        {resultBadge[log.result]?.label || log.result}
                      </Badge>
                      <span className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString('de-DE')}</span>
                    </div>
                    {log.notes && <p className="text-sm text-gray-600 mt-1">{log.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Integrate CallTracker into candidate detail page**

In `src/app/(portal)/candidates/[id]/page.tsx`:

Add state and fetch:
```typescript
const [callLogs, setCallLogs] = useState<CallLog[]>([]);
const [phoneScript, setPhoneScript] = useState<string | null>(null);

// In the existing useEffect, add:
fetch(`/api/candidates/${id}/calls`).then(r => r.json()).then(setCallLogs).catch(() => {});

// Fetch approved phone script for this agency
fetch(`/api/library?agency_id=${candidate?.agency_id}&content_type=phone_script`)
  .then(r => r.json())
  .then(items => {
    const approved = items.find((i: ContentLibraryItem) =>
      ['approved_internal', 'approved', 'deployed'].includes(i.status)
    );
    if (approved) setPhoneScript(approved.content);
  }).catch(() => {});
```

Add the component below the existing candidate details:
```tsx
<CallTracker
  candidateId={id}
  candidatePhone={candidate.phone}
  callLogs={callLogs}
  script={phoneScript}
  onLogCreated={(log) => setCallLogs(prev => [log, ...prev])}
/>
```

- [ ] **Step 4: Test**

1. Open a candidate detail page
2. See phone script (if one exists) and call form
3. Log a call with result + notes
4. Verify it appears in the history
5. Verify it's saved in `call_logs` table

- [ ] **Step 5: Commit**

```bash
git add src/app/api/candidates/\[id\]/calls/route.ts src/components/call-tracker.tsx src/app/\(portal\)/candidates/\[id\]/page.tsx
git commit -m "feat: call-tracking system with script display and structured logging"
```

---

### Task 6: Meta Marketing API — Ad Upload + Insights

**Files:**
- Create: `src/lib/meta/api.ts`
- Create: `src/app/api/meta/upload-ad/route.ts`
- Create: `src/app/api/meta/publish-ad/route.ts`
- Create: `src/app/api/meta/insights/route.ts`
- Create: `src/app/api/meta/sync-insights/route.ts`
- Modify: `src/app/(portal)/settings/page.tsx` (add Meta Ad Account ID field)

**Interfaces:**
- Consumes: `agencies.meta_ad_account_id`, `agencies.meta_page_id`, Meta system user token from env
- Produces: `uploadAdDraft(accountId, creative)`, `publishAd(adId)`, `fetchInsights(accountId, dateRange)` in `src/lib/meta/api.ts`

- [ ] **Step 1: Create `src/lib/meta/api.ts`**

```typescript
const META_API_VERSION = 'v21.0';
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

function getAccessToken(): string {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error('META_SYSTEM_USER_TOKEN not configured');
  return token;
}

async function metaFetch(path: string, options?: RequestInit & { params?: Record<string, string> }) {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set('access_token', getAccessToken());
  if (options?.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });

  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  return data;
}

export interface AdCreativeInput {
  name: string;
  pageId: string;
  imageUrl?: string;
  imageHash?: string;
  headline: string;
  body: string;
  description?: string;
  linkUrl: string;
  ctaType?: string;
}

export async function uploadImage(adAccountId: string, imageUrl: string): Promise<string> {
  const data = await metaFetch(`/act_${adAccountId}/adimages`, {
    method: 'POST',
    body: JSON.stringify({ url: imageUrl }),
  });
  // Returns { images: { hash: { hash: "...", ... } } }
  const images = data.images;
  const firstKey = Object.keys(images)[0];
  return images[firstKey].hash;
}

export async function createAdCreative(adAccountId: string, input: AdCreativeInput): Promise<string> {
  const objectStorySpec: Record<string, unknown> = {
    page_id: input.pageId,
    link_data: {
      message: input.body,
      link: input.linkUrl,
      name: input.headline,
      description: input.description || '',
      call_to_action: { type: input.ctaType || 'APPLY_NOW' },
      ...(input.imageHash ? { image_hash: input.imageHash } : {}),
    },
  };

  const data = await metaFetch(`/act_${adAccountId}/adcreatives`, {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      object_story_spec: objectStorySpec,
    }),
  });
  return data.id;
}

export async function createAd(adAccountId: string, adSetId: string, creativeId: string, name: string): Promise<string> {
  const data = await metaFetch(`/act_${adAccountId}/ads`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: 'PAUSED',
    }),
  });
  return data.id;
}

export async function publishAd(adId: string): Promise<void> {
  await metaFetch(`/${adId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'ACTIVE' }),
  });
}

export interface InsightRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number;
  ctr: number;
}

export async function fetchInsights(adAccountId: string, since: string, until: string): Promise<InsightRow[]> {
  const data = await metaFetch(`/act_${adAccountId}/insights`, {
    params: {
      fields: 'spend,impressions,clicks,actions',
      time_range: JSON.stringify({ since, until }),
      time_increment: '1',
      level: 'account',
    },
  });

  return (data.data || []).map((row: Record<string, unknown>) => {
    const actions = (row.actions as { action_type: string; value: string }[]) || [];
    const leadAction = actions.find(a => a.action_type === 'lead');
    const leads = leadAction ? parseInt(leadAction.value, 10) : 0;
    const spend = parseFloat(row.spend as string) || 0;
    const impressions = parseInt(row.impressions as string, 10) || 0;
    const clicks = parseInt(row.clicks as string, 10) || 0;

    return {
      date: row.date_start as string,
      spend,
      impressions,
      clicks,
      leads,
      cpl: leads > 0 ? spend / leads : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    };
  });
}
```

- [ ] **Step 2: Create API routes**

`src/app/api/meta/upload-ad/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { uploadImage, createAdCreative, createAd } from '@/lib/meta/api';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { agency_id, image_url, headline, body, description, link_url, cta_type, ad_set_id } = await request.json();

  const supabase = await createServerClient();
  const { data: agency } = await supabase
    .from('agencies')
    .select('meta_ad_account_id, meta_page_id')
    .eq('id', agency_id)
    .single();

  if (!agency?.meta_ad_account_id || !agency?.meta_page_id) {
    return NextResponse.json({ error: 'Meta Ad Account nicht konfiguriert' }, { status: 400 });
  }

  try {
    // 1. Upload image
    let imageHash: string | undefined;
    if (image_url) {
      imageHash = await uploadImage(agency.meta_ad_account_id, image_url);
    }

    // 2. Create creative
    const creativeId = await createAdCreative(agency.meta_ad_account_id, {
      name: `Recruiting Ad — ${headline}`,
      pageId: agency.meta_page_id,
      imageHash,
      headline,
      body,
      description,
      linkUrl: link_url,
      ctaType: cta_type || 'APPLY_NOW',
    });

    // 3. Create ad (PAUSED)
    const adId = await createAd(agency.meta_ad_account_id, ad_set_id, creativeId, `Ad — ${headline}`);

    return NextResponse.json({ ad_id: adId, creative_id: creativeId, status: 'PAUSED' });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Meta API error' }, { status: 500 });
  }
}
```

`src/app/api/meta/publish-ad/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { publishAd } from '@/lib/meta/api';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ad_id } = await request.json();
  try {
    await publishAd(ad_id);
    return NextResponse.json({ status: 'ACTIVE' });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Meta API error' }, { status: 500 });
  }
}
```

`src/app/api/meta/insights/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { fetchInsights } from '@/lib/meta/api';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const agencyId = searchParams.get('agency_id') || user.agency_id;
  if (!agencyId) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  const supabase = await createServerClient();
  const { data: agency } = await supabase
    .from('agencies')
    .select('meta_ad_account_id')
    .eq('id', agencyId)
    .single();

  if (!agency?.meta_ad_account_id) {
    return NextResponse.json({ error: 'Meta nicht verbunden' }, { status: 400 });
  }

  const since = searchParams.get('since') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const until = searchParams.get('until') || new Date().toISOString().split('T')[0];

  try {
    const insights = await fetchInsights(agency.meta_ad_account_id, since, until);
    return NextResponse.json(insights);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Meta API error' }, { status: 500 });
  }
}
```

`src/app/api/meta/sync-insights/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { fetchInsights } from '@/lib/meta/api';

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { data: agencies } = await supabase
    .from('agencies')
    .select('id, meta_ad_account_id')
    .not('meta_ad_account_id', 'is', null);

  if (!agencies?.length) return NextResponse.json({ synced: 0 });

  const since = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const until = new Date().toISOString().split('T')[0];
  let synced = 0;

  for (const agency of agencies) {
    try {
      const insights = await fetchInsights(agency.meta_ad_account_id!, since, until);
      for (const row of insights) {
        await supabase.from('meta_ad_reports').upsert({
          agency_id: agency.id,
          report_date: row.date,
          spend: row.spend,
          impressions: row.impressions,
          clicks: row.clicks,
          leads: row.leads,
          cpl: row.cpl,
          ctr: row.ctr,
          fetched_at: new Date().toISOString(),
        }, { onConflict: 'agency_id,report_date' });
      }
      synced++;
    } catch {
      // Log error but continue with other agencies
    }
  }

  return NextResponse.json({ synced });
}
```

- [ ] **Step 3: Add Meta Ad Account field to Settings page**

In `src/app/(portal)/settings/page.tsx`, in the Agentur card, add after the phone field:

```tsx
<div className="flex items-center justify-between py-3 border-t border-gray-100">
  <div>
    <p className="text-sm font-medium text-gray-900">Meta Ad Account ID</p>
    <p className="text-sm text-gray-500">{agency?.meta_ad_account_id || 'Nicht konfiguriert'}</p>
  </div>
</div>
<div className="flex items-center justify-between py-3 border-t border-gray-100">
  <div>
    <p className="text-sm font-medium text-gray-900">Meta Page ID</p>
    <p className="text-sm text-gray-500">{agency?.meta_page_id || 'Nicht konfiguriert'}</p>
  </div>
</div>
```

These are read-only for the client. Internal users set them via the admin client detail page.

- [ ] **Step 4: Add `META_SYSTEM_USER_TOKEN` to environment**

```bash
echo "META_SYSTEM_USER_TOKEN=..." >> ~/zoepp-media-cloud/.env.local
cd ~/zoepp-media-cloud && npx vercel env add META_SYSTEM_USER_TOKEN
```

- [ ] **Step 5: Test**

1. Set a test `meta_ad_account_id` on an agency
2. Call `GET /api/meta/insights?agency_id=...` → verify insights return
3. Call `POST /api/meta/sync-insights` → verify `meta_ad_reports` are populated

- [ ] **Step 6: Commit**

```bash
git add src/lib/meta/api.ts src/app/api/meta/ src/app/\(portal\)/settings/page.tsx
git commit -m "feat: Meta Marketing API — ad upload, publish, insights sync"
```

---

### Task 7: Reports Extension — Period Filter + Call KPIs + Meta Section

**Files:**
- Modify: `src/app/(portal)/reports/page.tsx`
- Modify: `src/app/api/reports/route.ts`

**Interfaces:**
- Consumes: `call_logs` table, `meta_ad_reports` table, existing `candidates` + `pipeline_stages`
- Produces: Extended reports API with `period` parameter and three data sections (pipeline, calls, meta)

- [ ] **Step 1: Extend `/api/reports/route.ts` with period filter**

Add period parsing at the top:
```typescript
const { searchParams } = request.nextUrl;
const period = searchParams.get('period') || 'all';

function getDateRange(period: string): { since: Date | null; until: Date } {
  const now = new Date();
  const until = now;
  switch (period) {
    case 'this_week': {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay() + 1); // Monday
      d.setHours(0, 0, 0, 0);
      return { since: d, until };
    }
    case 'this_month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { since: d, until };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { since: start, until: end };
    }
    default:
      return { since: null, until };
  }
}

const { since, until } = getDateRange(period);
```

Apply `since`/`until` to candidate queries. Also add call log KPIs:
```typescript
// Call KPIs
let callQuery = supabase.from('call_logs').select('*').eq('agency_id', agencyId);
if (since) callQuery = callQuery.gte('created_at', since.toISOString());

const { data: calls } = await callQuery;
const totalCalls = calls?.length || 0;
const reached = calls?.filter(c => c.result !== 'nicht_erreicht').length || 0;
const termine = calls?.filter(c => c.result === 'termin_vereinbart').length || 0;

// First-call response time
const { data: firstCalls } = await supabase.rpc('avg_first_call_time', { p_agency_id: agencyId });

const callKpis = {
  totalCalls,
  reachRate: totalCalls > 0 ? Math.round((reached / totalCalls) * 100) : 0,
  terminRate: totalCalls > 0 ? Math.round((termine / totalCalls) * 100) : 0,
  avgResponseHours: firstCalls?.[0]?.avg_hours || null,
};

// Meta KPIs
const { data: metaReports } = await supabase
  .from('meta_ad_reports')
  .select('*')
  .eq('agency_id', agencyId)
  .order('report_date', { ascending: false })
  .limit(30);

const metaKpis = metaReports && metaReports.length > 0 ? {
  totalSpend: metaReports.reduce((s, r) => s + (r.spend || 0), 0),
  totalLeads: metaReports.reduce((s, r) => s + (r.leads || 0), 0),
  avgCpl: metaReports.reduce((s, r) => s + (r.cpl || 0), 0) / metaReports.length,
  totalImpressions: metaReports.reduce((s, r) => s + (r.impressions || 0), 0),
  totalClicks: metaReports.reduce((s, r) => s + (r.clicks || 0), 0),
  daily: metaReports,
} : null;
```

Return all three sections:
```typescript
return NextResponse.json({ ...existingData, callKpis, metaKpis });
```

- [ ] **Step 2: Update Reports page to pass period and show new sections**

Wire the period state to the API call:
```typescript
useEffect(() => {
  fetch(`/api/reports?period=${period}`).then(r => r.json()).then(setData);
}, [period]);
```

Add Call Performance section:
```tsx
{data.callKpis && (
  <div className="space-y-4">
    <h2 className="text-lg font-bold text-gray-900">Call-Performance</h2>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card><p className="text-sm text-gray-500">Anrufe gesamt</p><p className="text-2xl font-bold">{data.callKpis.totalCalls}</p></Card>
      <Card><p className="text-sm text-gray-500">Erreichbarkeit</p><p className="text-2xl font-bold">{data.callKpis.reachRate}%</p></Card>
      <Card><p className="text-sm text-gray-500">Termin-Quote</p><p className="text-2xl font-bold">{data.callKpis.terminRate}%</p></Card>
      <Card><p className="text-sm text-gray-500">Ø Reaktionszeit</p><p className="text-2xl font-bold">{data.callKpis.avgResponseHours ? `${data.callKpis.avgResponseHours}h` : '–'}</p></Card>
    </div>
  </div>
)}
```

Add Meta Ads section (only if `metaKpis` is present):
```tsx
{data.metaKpis && (
  <div className="space-y-4">
    <h2 className="text-lg font-bold text-gray-900">Meta Ads</h2>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <Card><p className="text-sm text-gray-500">Ausgaben</p><p className="text-2xl font-bold">€{data.metaKpis.totalSpend.toFixed(2)}</p></Card>
      <Card><p className="text-sm text-gray-500">Leads</p><p className="text-2xl font-bold">{data.metaKpis.totalLeads}</p></Card>
      <Card><p className="text-sm text-gray-500">Ø CPL</p><p className="text-2xl font-bold">€{data.metaKpis.avgCpl.toFixed(2)}</p></Card>
      <Card><p className="text-sm text-gray-500">Impressions</p><p className="text-2xl font-bold">{data.metaKpis.totalImpressions.toLocaleString('de-DE')}</p></Card>
      <Card><p className="text-sm text-gray-500">Clicks</p><p className="text-2xl font-bold">{data.metaKpis.totalClicks.toLocaleString('de-DE')}</p></Card>
    </div>
  </div>
)}
```

- [ ] **Step 3: Test**

1. Open Reports page, switch between period filters → data should update
2. Create some call_logs via the call tracker → verify Call KPIs appear
3. If meta_ad_reports has data → verify Meta section appears

- [ ] **Step 4: Commit**

```bash
git add src/app/\(portal\)/reports/page.tsx src/app/api/reports/route.ts
git commit -m "feat: extend reports with period filter, call KPIs, and Meta Ads section"
```

---

### Task 8: Task Comments Route + Team Page

**Files:**
- Create: `src/app/api/tasks/[id]/comments/route.ts`
- Modify: `src/app/(internal)/team/page.tsx`

**Interfaces:**
- Consumes: `task_comments` table (exists), `team_members` + `employee_assignments` tables (exist)
- Produces: `GET/POST /api/tasks/[id]/comments`, full Team management page

- [ ] **Step 1: Create `src/app/api/tasks/[id]/comments/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, isInternal } from '@/lib/auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('task_comments')
    .select('*, users:user_id(name)')
    .eq('task_id', id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { text } = await request.json();
  if (!text?.trim()) return NextResponse.json({ error: 'Text required' }, { status: 400 });

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: id, user_id: user.id, text: text.trim() })
    .select('*, users:user_id(name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Build Team page `src/app/(internal)/team/page.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Users, Plus, Building2, Pencil, Trash2 } from 'lucide-react';
import { PageHeader, Card, Button, Badge, Modal, Input, Select } from '@/components/ui';
import type { TeamMember, Agency } from '@/lib/types/database';

interface TeamMemberWithAssignments extends TeamMember {
  agencies: { id: string; name: string }[];
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMemberWithAssignments[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberWithAssignments | null>(null);
  const [form, setForm] = useState({ name: '', position: '', agency_ids: [] as string[] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/team').then(r => r.json()),
      fetch('/api/admin/agencies').then(r => r.json()),
    ]).then(([teamData, agencyData]) => {
      setMembers(teamData);
      setAgencies(agencyData);
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    const method = editingMember ? 'PATCH' : 'POST';
    const url = editingMember ? `/api/team/${editingMember.id}` : '/api/team';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const updated = await res.json();
      if (editingMember) {
        setMembers(prev => prev.map(m => m.id === updated.id ? updated : m));
      } else {
        setMembers(prev => [...prev, updated]);
      }
      setShowModal(false);
      setEditingMember(null);
      setForm({ name: '', position: '', agency_ids: [] });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Mitarbeiter wirklich entfernen?')) return;
    const res = await fetch(`/api/team/${id}`, { method: 'DELETE' });
    if (res.ok) setMembers(prev => prev.filter(m => m.id !== id));
  }

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Mitarbeiter & Zuweisungen verwalten"
        action={
          <Button variant="primary" onClick={() => { setEditingMember(null); setForm({ name: '', position: '', agency_ids: [] }); setShowModal(true); }}>
            <Plus className="w-4 h-4 mr-1.5" />
            Mitarbeiter hinzufügen
          </Button>
        }
      />

      <div className="grid gap-4">
        {members.map(member => (
          <Card key={member.id}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                  <Users className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{member.name}</p>
                  <p className="text-sm text-gray-500">{member.position || 'Keine Position'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {member.agencies?.map(a => (
                  <Badge key={a.id} tone="softAccent">
                    <Building2 className="w-3 h-3 mr-1" />
                    {a.name}
                  </Badge>
                ))}
                <Button variant="ghost" size="sm" onClick={() => {
                  setEditingMember(member);
                  setForm({ name: member.name, position: member.position || '', agency_ids: member.agencies?.map(a => a.id) || [] });
                  setShowModal(true);
                }}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(member.id)}>
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {!loading && members.length === 0 && (
          <Card variant="inset">
            <p className="text-center text-gray-400 py-8">Noch keine Mitarbeiter hinzugefügt</p>
          </Card>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingMember ? 'Mitarbeiter bearbeiten' : 'Mitarbeiter hinzufügen'}>
        <div className="space-y-4">
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" />
          <Input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="Position (z.B. Account Manager)" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Zugewiesene Kunden</label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {agencies.map(a => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.agency_ids.includes(a.id)}
                    onChange={e => {
                      setForm(f => ({
                        ...f,
                        agency_ids: e.target.checked ? [...f.agency_ids, a.id] : f.agency_ids.filter(id => id !== a.id)
                      }));
                    }}
                    className="accent-red-500"
                  />
                  {a.name}
                </label>
              ))}
            </div>
          </div>
          <Button variant="primary" className="w-full" onClick={handleSave}>
            {editingMember ? 'Speichern' : 'Hinzufügen'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
```

- [ ] **Step 3: Create Team API route `src/app/api/team/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, isInternal } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { data: members } = await supabase.from('team_members').select('*').order('name');

  // Load assignments
  const result = [];
  for (const member of members || []) {
    const { data: assignments } = await supabase
      .from('employee_assignments')
      .select('agency_id, agencies:agency_id(id, name)')
      .eq('employee_id', member.user_id);
    result.push({ ...member, agencies: assignments?.map(a => a.agencies).filter(Boolean) || [] });
  }

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { name, position, agency_ids } = await request.json();
  const supabase = await createServerClient();

  // Create team member (user_id is set to the admin for now — in production, link to actual user)
  const { data: member, error } = await supabase
    .from('team_members')
    .insert({ user_id: user.id, name, position })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Create assignments
  if (agency_ids?.length) {
    await supabase.from('employee_assignments').insert(
      agency_ids.map((agency_id: string) => ({ employee_id: member.user_id, agency_id }))
    );
  }

  return NextResponse.json({ ...member, agencies: [] });
}
```

- [ ] **Step 4: Create Team member detail API `src/app/api/team/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { name, position, agency_ids } = await request.json();
  const supabase = await createServerClient();

  const { data: member, error } = await supabase
    .from('team_members')
    .update({ name, position })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Rebuild assignments
  if (agency_ids !== undefined) {
    await supabase.from('employee_assignments').delete().eq('employee_id', member.user_id);
    if (agency_ids.length) {
      await supabase.from('employee_assignments').insert(
        agency_ids.map((agency_id: string) => ({ employee_id: member.user_id, agency_id }))
      );
    }
  }

  return NextResponse.json(member);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from('team_members').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Test**

1. Open `/team` → should show team members (or empty state)
2. Add a team member with name + position + agency assignment
3. Edit and delete
4. Open a task detail modal → add a comment → verify it appears

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tasks/\[id\]/comments/route.ts src/app/\(internal\)/team/page.tsx src/app/api/team/
git commit -m "feat: task comments API + team management page with CRUD and agency assignments"
```

---

### Task 9: Fulfillment — Extended Tasks + 1-Click Actions

**Files:**
- Modify: `src/app/api/onboarding/route.ts` (generate extended task list)
- Modify: `src/app/(internal)/clients/[id]/fulfillment/page.tsx`
- Modify: `src/app/api/fulfillment/route.ts` (add PATCH support if missing)

**Interfaces:**
- Consumes: `generateContent()` from `src/lib/ai/claude.ts`, Meta API from `src/lib/meta/api.ts`, Perspective MCP
- Produces: Extended fulfillment task list (10 tasks), 1-click generate/upload actions per task

- [ ] **Step 1: Extend auto-generated fulfillment tasks in onboarding API**

In `src/app/api/onboarding/route.ts`, replace the existing 4-task insert with 10 tasks:

```typescript
const fulfillmentTasks = [
  { title: 'Ad Copys generieren', task_type: 'ad_copy', sort_order: 1 },
  { title: 'Telefon-Skripte generieren', task_type: 'phone_script', sort_order: 2 },
  { title: 'Video-Skripte generieren', task_type: 'video_script', sort_order: 3 },
  { title: 'Stellenanzeigen generieren', task_type: 'job_posting', sort_order: 4 },
  { title: 'Creative Brief generieren', task_type: 'creative_brief', sort_order: 5 },
  { title: 'Perspective Funnel erstellen', task_type: 'perspective_funnel', sort_order: 6 },
  { title: 'Meta Zugang verifizieren', task_type: 'manual', sort_order: 7 },
  { title: 'Meta Kampagne hochladen', task_type: 'meta_upload', sort_order: 8 },
  { title: 'Indeed Texte einpflegen', task_type: 'manual', sort_order: 9 },
  { title: 'Funnel veröffentlichen', task_type: 'funnel_publish', sort_order: 10 },
];

await supabase.from('fulfillment_tasks').insert(
  fulfillmentTasks.map(t => ({
    agency_id: agencyId,
    title: t.title,
    task_type: t.task_type,
    status: 'pending',
    sort_order: t.sort_order,
  }))
);
```

Update the `FulfillmentTask.task_type` type in `database.ts` to include the new types:
```typescript
task_type: 'perspective_funnel' | 'ad_copy' | 'phone_script' | 'video_script' | 'job_posting' | 'creative_brief' | 'meta_upload' | 'funnel_publish' | 'manual' | 'script' | 'meta_campaign' | 'other';
```

- [ ] **Step 2: Update fulfillment page with 1-click actions per task type**

In the fulfillment page, add action buttons based on task type:

```tsx
function getActionButton(task: FulfillmentTask) {
  const aiTypes = ['ad_copy', 'phone_script', 'video_script', 'job_posting', 'creative_brief'];

  if (aiTypes.includes(task.task_type) && task.status === 'pending') {
    return (
      <Button size="sm" variant="primary" onClick={() => generateContent(task)}>
        AI Generieren
      </Button>
    );
  }

  if (task.task_type === 'meta_upload' && task.status === 'pending') {
    return (
      <Button size="sm" variant="primary" onClick={() => uploadToMeta(task)}>
        In Meta hochladen
      </Button>
    );
  }

  if (task.task_type === 'funnel_publish' && task.status === 'pending') {
    return (
      <Button size="sm" variant="primary" onClick={() => publishFunnel(task)}>
        Funnel veröffentlichen
      </Button>
    );
  }

  if (task.task_type === 'manual') {
    return (
      <Button size="sm" variant="soft" onClick={() => updateStatus(task.id, 'done')}>
        Erledigt
      </Button>
    );
  }

  return null;
}
```

Add the `uploadToMeta` function:
```typescript
async function uploadToMeta(task: FulfillmentTask) {
  updateStatus(task.id, 'in_progress');
  try {
    // Get approved ad copys and creative from content library
    const contentRes = await fetch(`/api/library?agency_id=${agencyId}&content_type=ad_copy`);
    const contents = await contentRes.json();
    const approved = contents.find((c: ContentLibraryItem) => c.status === 'approved');

    if (!approved) {
      alert('Bitte zuerst Ad Copys generieren und freigeben lassen.');
      updateStatus(task.id, 'pending');
      return;
    }

    const res = await fetch('/api/meta/upload-ad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agency_id: agencyId,
        headline: approved.title,
        body: approved.content,
        link_url: '', // Funnel URL
      }),
    });

    if (res.ok) {
      updateStatus(task.id, 'done');
    } else {
      const err = await res.json();
      alert(`Fehler: ${err.error}`);
      updateStatus(task.id, 'pending');
    }
  } catch {
    updateStatus(task.id, 'pending');
  }
}
```

- [ ] **Step 3: Update `generateContent` to save to content_library**

When AI generates content, also create an entry in `content_library` with status `draft`:

```typescript
async function generateContent(task: FulfillmentTask) {
  updateStatus(task.id, 'in_progress');
  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: task.task_type, agency_id: agencyId }),
    });

    if (res.ok) {
      const data = await res.json();
      // Also save to content library
      await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency_id: agencyId,
          content_type: task.task_type,
          title: task.title,
          content: data.content,
          status: 'draft',
        }),
      });
      updateStatus(task.id, 'review');
    }
  } catch {
    updateStatus(task.id, 'pending');
  }
}
```

- [ ] **Step 4: Test the full fulfillment flow**

1. Complete onboarding for a test agency
2. Verify 10 fulfillment tasks are created
3. Click "AI Generieren" on ad_copy task → verify real Claude content is generated
4. Verify content appears in content library with status `draft`
5. Test manual tasks (Meta Zugang, Indeed)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/onboarding/route.ts src/app/\(internal\)/clients/\[id\]/fulfillment/page.tsx src/lib/types/database.ts
git commit -m "feat: extended fulfillment tasks — 10 steps with 1-click AI generation and Meta upload"
```

---

### Task 10: Perspective MCP — Funnel Creation + Webhook

**Files:**
- Create: `src/app/api/perspective/create-funnel/route.ts`
- Create: `src/app/api/perspective/publish/route.ts`
- Create: `src/app/api/perspective/stats/route.ts`
- Modify: `src/app/api/webhooks/perspective/route.ts` (create if not exists)
- Modify: `src/app/(internal)/funnels/page.tsx` (replace stub)

**Interfaces:**
- Consumes: Perspective MCP tools (`create_funnel`, `publish_funnel`, `get_funnel_stats`), `onboarding_submissions` for brand data
- Produces: Funnel CRUD API, incoming lead webhook, funnels management page

- [ ] **Step 1: Create Perspective API routes**

`src/app/api/perspective/create-funnel/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { agency_id } = await request.json();
  const supabase = await createServerClient();

  // Get onboarding data for funnel content
  const { data: onboarding } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .eq('agency_id', agency_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!onboarding) {
    return NextResponse.json({ error: 'Onboarding nicht abgeschlossen' }, { status: 400 });
  }

  // NOTE: Perspective MCP integration requires the MCP tools to be available
  // at runtime. For now, save a placeholder funnel record.
  // When MCP is available, call: create_funnel, then update this record.

  const { data: funnel, error } = await supabase
    .from('perspective_funnels')
    .insert({
      agency_id,
      name: `Recruiting Funnel — ${onboarding.company_name}`,
      status: 'draft',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(funnel);
}
```

`src/app/api/perspective/publish/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { funnel_id } = await request.json();
  const supabase = await createServerClient();

  // NOTE: Call Perspective MCP publish_funnel here when available
  const { data, error } = await supabase
    .from('perspective_funnels')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('id', funnel_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create Perspective webhook for incoming leads**

`src/app/api/webhooks/perspective/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Perspective sends lead data via webhook
  const { name, email, phone, funnel_id } = body;

  const supabase = await createServerClient();

  // Find agency by funnel
  const { data: funnel } = await supabase
    .from('perspective_funnels')
    .select('agency_id')
    .eq('perspective_funnel_id', funnel_id)
    .single();

  if (!funnel) return NextResponse.json({ error: 'Unknown funnel' }, { status: 404 });

  // Get first pipeline stage
  const { data: firstStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .order('sort_order', { ascending: true })
    .limit(1)
    .single();

  if (!firstStage) return NextResponse.json({ error: 'No pipeline stages' }, { status: 500 });

  // Create candidate
  const { data: candidate, error } = await supabase
    .from('candidates')
    .insert({
      agency_id: funnel.agency_id,
      name: name || 'Unbekannt',
      email: email || null,
      phone: phone || null,
      source: 'meta', // Perspective leads come from Meta ads
      current_stage_id: firstStage.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log initial stage
  await supabase.from('candidate_stages').insert({
    candidate_id: candidate.id,
    stage_id: firstStage.id,
  });

  return NextResponse.json({ ok: true, candidate_id: candidate.id });
}
```

- [ ] **Step 3: Build funnels management page**

Replace the stub in `src/app/(internal)/funnels/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Globe, Plus, ExternalLink, BarChart3, Rocket } from 'lucide-react';
import { PageHeader, Card, Button, Badge } from '@/components/ui';
import type { PerspectiveFunnel, Agency } from '@/lib/types/database';

export default function FunnelsPage() {
  const [funnels, setFunnels] = useState<(PerspectiveFunnel & { agency_name?: string })[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/perspective/funnels').then(r => r.json()),
      fetch('/api/admin/agencies').then(r => r.json()),
    ]).then(([funnelData, agencyData]) => {
      setFunnels(funnelData);
      setAgencies(agencyData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function createFunnel(agencyId: string) {
    const res = await fetch('/api/perspective/create-funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agency_id: agencyId }),
    });
    if (res.ok) {
      const funnel = await res.json();
      setFunnels(prev => [...prev, funnel]);
    }
  }

  async function publishFunnel(funnelId: string) {
    const res = await fetch('/api/perspective/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funnel_id: funnelId }),
    });
    if (res.ok) {
      setFunnels(prev => prev.map(f => f.id === funnelId ? { ...f, status: 'published' } : f));
    }
  }

  const statusBadge: Record<string, { label: string; tone: string }> = {
    draft: { label: 'Entwurf', tone: 'neutral' },
    published: { label: 'Live', tone: 'success' },
    archived: { label: 'Archiviert', tone: 'outline' },
  };

  return (
    <>
      <PageHeader title="Funnels" subtitle="Perspective Funnels verwalten" />

      <div className="grid gap-4">
        {funnels.map(funnel => (
          <Card key={funnel.id}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{funnel.name}</p>
                  {funnel.url && (
                    <a href={funnel.url} target="_blank" rel="noopener noreferrer" className="text-sm text-red-500 hover:underline flex items-center gap-1">
                      {funnel.url} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={statusBadge[funnel.status]?.tone as 'success' | 'neutral' | 'outline' || 'neutral'}>
                  {statusBadge[funnel.status]?.label || funnel.status}
                </Badge>
                {funnel.status === 'draft' && (
                  <Button size="sm" variant="primary" onClick={() => publishFunnel(funnel.id)}>
                    <Rocket className="w-3.5 h-3.5 mr-1" />
                    Veröffentlichen
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}

        {!loading && funnels.length === 0 && (
          <Card variant="inset">
            <p className="text-center text-gray-400 py-8">Noch keine Funnels erstellt</p>
          </Card>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Create funnels list API `src/app/api/perspective/funnels/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('perspective_funnels')
    .select('*, agencies:agency_id(name)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 5: Test**

1. Open `/funnels` → should show funnels or empty state
2. Create a funnel via fulfillment 1-click
3. Publish it
4. Send test webhook payload to `/api/webhooks/perspective` → verify candidate created in kanban

- [ ] **Step 6: Commit**

```bash
git add src/app/api/perspective/ src/app/api/webhooks/perspective/route.ts src/app/\(internal\)/funnels/page.tsx
git commit -m "feat: Perspective funnel management — create, publish, lead webhook"
```

---

## Execution Order

Tasks 1-2 are foundational (migration + AI). Tasks 3-10 can mostly be parallelized in pairs:
- **Sequential:** Task 1 → Task 2 (migration before AI)
- **Parallel group 1:** Tasks 3 + 4 (onboarding + approval flow)
- **Parallel group 2:** Tasks 5 + 6 (call tracking + Meta API)
- **Parallel group 3:** Tasks 7 + 8 (reports + team)
- **Sequential after all:** Task 9 (fulfillment uses AI + Meta + approval)
- **Last:** Task 10 (Perspective, depends on nothing but benefits from everything)
