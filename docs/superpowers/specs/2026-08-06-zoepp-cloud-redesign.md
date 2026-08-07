# Zoepp Media Cloud — Complete Redesign Spec

## Context

Zoepp Media Cloud is a free client portal for D2D recruitment agencies that work with Content-Leads.de/Zoepp Media. It serves dual purpose:
- **Client-facing**: Bewerber-Kanban, Performance-Reports, Masterclass-Videos, Onboarding
- **Internal**: Projekt-Management, Aufgaben-Tracking, 1-Click Fulfillment, AI-Tools

### User Roles (4)
1. **Admin** (Felix) — full access, sees all agencies, all internal tools
2. **Mitarbeiter** (Zoepp Media team) — works on client projects, tasks, AI tools, builds funnels
3. **Agentur-Inhaber** (client owner) — sees own Kanban, Reports, Masterclass
4. **Agentur-Mitarbeiter** (client team) — same as Inhaber but scoped to their agency

### Design System
Apple Red Software System — red accent (#E0354B), Apple-style minimalism, SF Pro / Inter Tight, soft shadows, Sidebar navigation.

---

## Phase 1: Design System + Sidebar + Rollen

### 1.1 Design Token Integration

Port Apple Red tokens to Tailwind CSS v4:
- Colors: Red ramp (050–900), Gray neutrals (000–900), semantic (green, amber, danger)
- Typography: Inter Tight font, 4-size scale (display/h2/lead/body), weights 400–800
- Spacing: 4px base (space-1 through space-16)
- Radii: xs(8)→sm(10)→md(12)→lg(16)→xl(20)→2xl(24)→pill(999)
- Shadows: xs/sm/md/lg/accent (layered, soft, diffuse)
- Effects: glass blur, ease-out transitions (120ms fast, 220ms med)
- Control heights: sm(32)→md(40)→lg(48)→xl(56)

Place tokens in `src/styles/tokens/` as CSS files, import in globals.css.

### 1.2 Component Library

Build reusable components in `src/components/ui/`:

**Core:**
- `Button` — variants: primary (red gradient), secondary (white+border), soft (red-050), ghost. Sizes: sm/md/lg/xl. Props: pill, glow, disabled.
- `Badge` — tones: accent, softAccent, success, neutral, outline
- `IconButton` — square, active state with red-050 fill
- `Input` — leading icon, sizes md/lg, pill variant
- `Select` — native select with custom styling
- `SegmentedControl` — pill container, red active state

**Surfaces:**
- `Card` — default (white+shadow) and inset (gray+border) variants
- `Modal` — centered, no dark scrim, blur background
- `FeatureRow` — icon tile + text + optional check

**Navigation:**
- `Sidebar` — fixed left, 250px, brand header, nav items with red active state, promo slot, footer slot

### 1.3 Layout Structure

```
┌─────────────┬──────────────────────────────┐
│   Sidebar   │         Main Content         │
│   (250px)   │                              │
│             │   ┌──────────────────────┐   │
│  [Logo]     │   │   Page Header        │   │
│  [Nav]      │   ├──────────────────────┤   │
│             │   │                      │   │
│             │   │   Page Content       │   │
│             │   │                      │   │
│             │   └──────────────────────┘   │
│  [Promo]    │                              │
│  [Footer]   │                              │
└─────────────┴──────────────────────────────┘
```

**Sidebar navigation items per role:**

Admin:
- Dashboard (Übersicht aller Agenturen)
- Kunden (Agentur-Liste + Drill-down)
- Team (Mitarbeiter-Verwaltung)
- Einladungen (Invite-Links generieren)
- Einstellungen

Mitarbeiter:
- Dashboard (eigene Aufgaben + Kunden-Übersicht)
- Kunden (zugewiesene Agenturen)
- Aufgaben (eigene TODOs)
- AI Tools (Copy-Generator, Skript-Editor)
- Funnels (Perspective-Management)
- Einstellungen

Agentur-Inhaber / Agentur-Mitarbeiter:
- Dashboard (Bewerber-Übersicht)
- Bewerber (Kanban-Board)
- Masterclass (Videos + TODOs)
- Reports (Performance-Zahlen)
- Einstellungen

### 1.4 Database Changes

New table `roles`:
- Remove `role` text column from `users` table
- Add `role` enum type: `admin`, `employee`, `agency_owner`, `agency_member`
- Add `role` column to `users` with this enum

New table `team_members` (for Zoepp Media internal team):
- `id` UUID PK
- `user_id` FK → users
- `name` text
- `position` text (e.g. "Account Manager")
- `created_at` timestamptz

Update RLS policies to support 4 roles.

### 1.5 Pages to Redesign

Every existing page gets rebuilt with Apple Red components:
- `/login` → Apple Red styled, centered card on gradient background
- `/register/[token]` → matching style
- `/dashboard` → role-based dashboard (different for each role)
- `/candidates/[id]` → redesigned with Card components
- `/settings` → redesigned
- `/admin/*` → integrated into sidebar nav, redesigned

---

## Phase 2: Onboarding + Fulfillment

### 2.1 Client Onboarding Form

New page `/onboarding/[token]` — multi-step form the agency fills out after registration:

**Step 1 — Unternehmen:**
- Firmenname, Branche (D2D sub-type: Solar, Glasfaser, Strom/Gas, etc.)
- Region/Standort
- Anzahl aktuelle Mitarbeiter
- Website URL

**Step 2 — Recruiting-Ziele:**
- Wie viele Mitarbeiter sollen eingestellt werden?
- Zeitraum
- Erfahrung gewünscht? (Quereinsteiger OK?)
- Gehalt/Provision Modell (für Ads)

**Step 3 — Branding:**
- Logo Upload
- Primärfarbe
- Fotos vom Team / Büro (optional)
- USPs / Was macht euch besonders?

**Step 4 — Kontakt:**
- Ansprechpartner Name + Telefon
- Bevorzugte Kontaktzeit

Data stored in new `onboarding_submissions` table.

### 2.2 Fulfillment Dashboard (Mitarbeiter-Sicht)

New page `/fulfillment/[agency_id]`:

When onboarding is submitted, system auto-generates a fulfillment checklist:
1. **Perspective Funnel erstellen** → 1-Click via MCP (`create_funnel` with brand data)
2. **Ad Copys generieren** → AI generates based on Branche + USPs + Ziele
3. **Telefon-Skripte generieren** → AI generates call scripts
4. **Meta Kampagne vorbereiten** → Checklist with generated assets

Each item has status: pending → in_progress → review → done.

### 2.3 AI Generation System

API route `/api/ai/generate`:
- Input: type (ad_copy | script | funnel_text), context (onboarding data)
- Output: generated text with "Regenerate" button
- Uses Claude API for generation
- Mitarbeiter can edit, approve, or regenerate

### 2.4 Perspective MCP Integration

Functions used:
- `create_funnel` — auto-create funnel from template + brand data
- `update_funnel` — modify funnel content
- `publish_funnel` — go live
- `get_funnel_stats` — show performance
- `list_domains` — assign domain

Wrapped in internal API routes `/api/perspective/*` with auth checks.

### 2.5 Database Changes

New tables:
- `onboarding_submissions` — stores form data per agency (JSON fields for flexibility)
- `fulfillment_tasks` — auto-generated tasks per agency with status tracking
- `generated_content` — stores AI-generated copys/scripts with version history

---

## Phase 3: Masterclass + Aufgaben

### 3.1 Masterclass System

New pages:
- `/masterclass` — module overview with progress bar
- `/masterclass/[module_id]` — module detail with videos + tasks

**Structure:**
- Masterclass has multiple **Modules** (ordered)
- Each Module has multiple **Lessons** (ordered)
- Each Lesson has:
  - Title + description
  - Video embed (YouTube or Vimeo URL)
  - Optional TODOs/tasks the agency must complete
  - Completion tracking (watched + tasks done)

**UI:**
- Left: module list with progress indicators (checkmarks, progress bars)
- Right: video player + lesson content + task checklist

### 3.2 Client Tasks

Task system for things the agency needs to do (from Masterclass or standalone):
- "Logo hochladen"
- "Onboarding-Formular ausfüllen"
- "Erstes Video anschauen"
- "Feedback zur Kampagne geben"

Displayed as checklist in Masterclass and on client Dashboard.

### 3.3 Admin View — Masterclass Management

Admin page `/admin/masterclass`:
- CRUD for modules and lessons
- Upload/link videos
- Create task templates
- See completion stats per agency

### 3.4 Database Changes

New tables:
- `masterclass_modules` — id, title, description, sort_order, created_at
- `masterclass_lessons` — id, module_id FK, title, description, video_url, video_provider (youtube|vimeo), sort_order, created_at
- `lesson_tasks` — id, lesson_id FK, title, description, sort_order
- `agency_lesson_progress` — agency_id FK, lesson_id FK, watched (bool), completed_at
- `agency_task_progress` — agency_id FK, task_id FK, completed (bool), completed_at
- `client_tasks` — id, agency_id FK, title, description, due_date, completed, created_by FK, created_at

---

## Phase 4: Mitarbeiter-Pipeline + Projektmanagement

### 4.1 Internal Task Board

New page `/tasks`:
- Kanban-style board for internal tasks (not candidates)
- Columns: Backlog → To Do → In Progress → Review → Done
- Tasks assigned to team members, linked to agencies
- Priority levels: low, medium, high, urgent
- Due dates

### 4.2 Client Project View

New page `/clients/[id]` (Mitarbeiter/Admin):
- Overview card: agency info, onboarding status, subscription info
- Tabs:
  - **Übersicht** — KPIs, recent activity
  - **Fulfillment** — fulfillment checklist status
  - **Bewerber** — view their candidate pipeline (read-only for internal)
  - **Aufgaben** — tasks related to this client
  - **Funnels** — Perspective funnel stats + management
  - **AI Tools** — generate/edit copys and scripts for this client
  - **Masterclass** — see client's progress
  - **Zufriedenheit** — satisfaction survey results

### 4.3 AI Chat Interface

New component on client project page:
- Chat-style interface to generate and refine ad copys, scripts, funnel texts
- Context-aware: knows the client's branche, USPs, Ziele from onboarding
- "Regenerate" and "Use this" buttons
- History of generated content

Uses ChatComposer from Apple Red design system.

### 4.4 Perspective Funnel Management

On client project page, Funnels tab:
- List all funnels for this client
- Show stats (via `get_funnel_stats`)
- Publish/unpublish (via `publish_funnel`)
- Update content (via `update_funnel`)
- Link to Perspective editor

### 4.5 Database Changes

New tables:
- `internal_tasks` — id, title, description, agency_id FK (nullable), assigned_to FK, status enum, priority enum, due_date, created_by FK, created_at, updated_at
- `task_comments` — id, task_id FK, user_id FK, text, created_at
- `ai_conversations` — id, agency_id FK, user_id FK, type (ad_copy|script|funnel_text), created_at
- `ai_messages` — id, conversation_id FK, role (user|assistant), content text, created_at
- `perspective_funnels` — id, agency_id FK, perspective_funnel_id text, name, status, created_at

---

## Phase 5: Reporting + Zufriedenheit

### 5.1 Client Reports Page

New page `/reports` (agency view):
- **Bewerber-Performance:**
  - Total Bewerber (gesamt + Zeitraum)
  - Conversion-Funnel: Eingang → Kontaktiert → Termin → VG → Probetag → Eingestellt
  - Conversion-Rate pro Phase
  - Bewerber nach Quelle (Meta, Indeed, Manual)
  - Trend-Chart (Bewerber pro Woche/Monat)
- **Zeitraum-Filter:** Diese Woche, Dieser Monat, Letzter Monat, Gesamt, Custom

### 5.2 Satisfaction Surveys

System to measure client satisfaction:
- Admin creates survey templates (simple: 1-5 stars + comment)
- Surveys sent periodically or manually triggered
- Client sees survey modal/page in their portal
- Results visible in Admin + Client Project View

### 5.3 Meta Ads Reporting (prepared, API later)

Database structure ready for when Meta API is connected:
- `meta_ad_reports` table for storing fetched data
- Cron job skeleton that can be activated
- Display: Spend, CPL, Impressions, Clicks, CTR per agency
- Both client and internal view

### 5.4 Admin Reporting Dashboard

Enhanced `/admin` dashboard:
- All agencies at a glance with traffic-light status
- Aggregate KPIs: total candidates, total hires, avg conversion rate
- Agencies needing attention (low satisfaction, inactivity, low conversion)
- Revenue/growth metrics placeholder

### 5.5 Database Changes

New tables:
- `survey_templates` — id, title, description, questions (JSONB), active bool, created_at
- `survey_responses` — id, template_id FK, agency_id FK, user_id FK, answers (JSONB), created_at
- `meta_ad_reports` — id, agency_id FK, date, spend, impressions, clicks, leads, cpl, fetched_at
- `report_snapshots` — id, agency_id FK, period_start, period_end, data (JSONB), created_at

---

## Technical Decisions

### Shared Across All Phases
- **Tailwind CSS v4** with Apple Red tokens as CSS custom properties
- **No additional UI library** — all components built from Apple Red specs
- **lucide-react** for icons (replacing CDN Lucide)
- **Inter Tight** from Google Fonts (SF Pro as local fallback)
- **Supabase** for all data + auth
- **Next.js 16 App Router** with server components where possible
- **API Routes** for all mutations
- **RLS** updated per phase for new tables

### File Structure
```
src/
├── app/
│   ├── (auth)/          # login, register (no sidebar)
│   ├── (portal)/        # agency-facing pages (sidebar layout)
│   │   ├── dashboard/
│   │   ├── candidates/
│   │   ├── masterclass/
│   │   ├── reports/
│   │   └── settings/
│   ├── (internal)/      # admin + mitarbeiter pages (sidebar layout)
│   │   ├── admin/
│   │   ├── clients/
│   │   ├── tasks/
│   │   ├── funnels/
│   │   └── ai-tools/
│   └── api/
│       ├── auth/
│       ├── candidates/
│       ├── masterclass/
│       ├── tasks/
│       ├── fulfillment/
│       ├── ai/
│       ├── perspective/
│       ├── surveys/
│       ├── reports/
│       └── webhooks/
├── components/
│   ├── ui/              # Apple Red design system components
│   ├── kanban/          # existing kanban (restyled)
│   ├── masterclass/     # masterclass-specific
│   ├── fulfillment/     # fulfillment-specific
│   └── reports/         # charts, metrics
├── lib/
│   ├── supabase/
│   ├── ai/              # Claude API helpers
│   ├── perspective/     # MCP wrapper
│   └── types/
└── styles/
    └── tokens/          # Apple Red CSS tokens
```
