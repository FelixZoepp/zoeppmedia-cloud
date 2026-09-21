# Phase 2: WhatsApp-Anbindung + Chat-Inbox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WhatsApp Cloud API anbinden (Embedded Signup + Manual Connect), Nachrichten senden/empfangen mit 24h-Fensterlogik, Vorlagen-Rollout, Opt-out/STOP-Erkennung, minute-cron Worker-Tick fuer events_inbox und scheduled_jobs, und eine Echtzeit-Chat-Inbox mit Zuweisung, Medienversand, Quick Replies und Benachrichtigungen in die bestehende Zoepp Media Cloud einbauen.

**Architecture:** Eingehende WhatsApp-Webhooks schreiben nur in `events_inbox` und antworten sofort 200. Ein minuetlicher Cron `/api/cron/tick` claimed pending Events und scheduled_jobs atomar per Postgres-Funktion (FOR UPDATE SKIP LOCKED) und dispatcht an Worker-Funktionen in `src/lib/workers/`. Ausgehende Nachrichten laufen immer ueber `sendWhatsAppMessage()` mit Preflight-Checks (Consent, Fenster, Ruhezeiten, STOP). Die Meta Cloud API ist hinter einem `WhatsAppProvider`-Interface gekapselt. Tokens werden AES-256-GCM-verschluesselt in der DB gespeichert. Die Inbox nutzt Supabase Realtime auf `messages` und `conversations` gefiltert nach `agency_id`.

**Tech Stack:** Next.js 16.3.0 (App Router), React 19, TypeScript strict, Tailwind v4, Supabase Postgres + RLS + Realtime + Storage, zod, vitest, Node `crypto` (AES-256-GCM), sonner, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-21-spec-recruiting-plattform.md` (Abschnitte 4, 7, 9, 13, 16 Phase 2) + `docs/superpowers/specs/2026-09-21-integration-design.md`

## Global Constraints

- Next.js 16.3.0 App Router: Route-Params sind `Promise<>` und muessen geawaited werden; `src/proxy.ts` statt middleware.ts.
- TypeScript strict; Tailwind v4; Custom UI Kit `src/components/ui` (NICHT shadcn).
- ALLE nutzersichtbaren Strings auf Deutsch mit ECHTEN Umlauten (ae oe ue ss VERBOTEN — immer ae->ä, oe->ö, ue->ü, ss->ß wo korrekt).
- API Auth-Chain: `getCurrentUser` -> 401 'Nicht autorisiert'; `canWriteRole` -> 403 'Keine Schreibrechte'; `getEffectiveAgencyId` -> 403 'Keine Agentur'; JEDE Tenant-Query mit `.eq('agency_id', agencyId)`.
- Multi-Tenant-Spalte: `agency_id` (NICHT org_id). Mandanten-Tabelle: `agencies` (NICHT organizations).
- zod-Validierung an API-Grenzen.
- Keine neuen npm-Dependencies (Facebook JS SDK per Script-Tag; Crypto ueber Node built-in; Timezone ueber Intl API).
- Migrationen: additiv, Live-DB mit 6 echten Agenturen. Neue Datei: `supabase/migrations/20260921000008_whatsapp_inbox.sql`.
- Webhooks: Signatur pruefen, Roh-Payload in `events_inbox` schreiben, mit 200 in <2s antworten; Verarbeitung im Worker.
- Vitest fuer Unit-Tests; 38 bestehende Tests in 5 Dateien muessen gruen bleiben.
- Commit nach jedem Task (feat:/fix: Prefixe).

---

## File Structure

### New Files

| Pfad | Verantwortung |
|---|---|
| `supabase/migrations/20260921000008_whatsapp_inbox.sql` | Tabellen, RLS, Realtime, claim-Funktionen |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt fuer Tokens |
| `src/lib/whatsapp/provider.ts` | `WhatsAppProvider` Interface + `CloudApiProvider` |
| `src/lib/whatsapp/window.ts` | 24h-Fenster-Logik und Preflight-Checks |
| `src/lib/whatsapp/send.ts` | `sendWhatsAppMessage()` — einziger Ausgangsweg |
| `src/lib/whatsapp/template-presets.ts` | 10 Vorlagen-Definitionen mit deutschem Body |
| `src/lib/workers/whatsapp-inbound.ts` | Worker: eingehende Nachricht verarbeiten |
| `src/lib/workers/whatsapp-status.ts` | Worker: Zustellstatus aktualisieren |
| `src/lib/workers/whatsapp-send.ts` | Worker: ausgehende Nachricht senden |
| `src/lib/workers/media-download.ts` | Worker: Medien von Meta -> Storage |
| `src/app/api/webhooks/whatsapp/route.ts` | GET (Verify) + POST (Events) |
| `src/app/api/cron/tick/route.ts` | Minuten-Cron: events_inbox + scheduled_jobs |
| `src/app/api/cron/sync-whatsapp/route.ts` | Stuendlich: Vorlagen- + Qualitaetssync |
| `src/app/api/whatsapp/embedded-signup/callback/route.ts` | Code->Token, Nummer registrieren |
| `src/app/api/whatsapp/manual-connect/route.ts` | Platform-Admin Manual Connect |
| `src/app/api/whatsapp/send/route.ts` | Nachricht aus Inbox senden |
| `src/app/api/quick-replies/route.ts` | CRUD: Quick Replies |
| `src/app/(portal)/settings/whatsapp/page.tsx` | Embedded Signup + Status UI |
| `src/app/(portal)/inbox/page.tsx` | Inbox-Seite |
| `src/components/inbox/conversation-list.tsx` | Linke Spalte: Gespraechsliste |
| `src/components/inbox/chat-pane.tsx` | Mitte: Chat-Verlauf + Composer |
| `src/components/inbox/candidate-sidebar.tsx` | Rechts: Bewerber-Details |
| `src/components/inbox/template-picker.tsx` | Vorlagen-Auswahl bei geschlossenem Fenster |
| `src/components/inbox/quick-reply-modal.tsx` | Quick-Reply-Verwaltung + Einfuegen |
| `src/lib/recruiting/__tests__/crypto.test.ts` | Crypto-Roundtrip-Tests |
| `src/lib/recruiting/__tests__/window.test.ts` | Fensterlogik + Preflight-Tests |
| `src/lib/recruiting/__tests__/webhook.test.ts` | Signatur-Verifikation + STOP-Tests |

### Modified Files

| Pfad | Aenderung |
|---|---|
| `src/lib/types/database.ts` | Neue Typen: WhatsAppAccount, Conversation, Message, QuickReply, WhatsAppTemplate |
| `src/components/app-sidebar.tsx` | Inbox-Nav-Item fuer Agency-Rollen, WhatsApp-Settings-Link |
| `src/lib/notifications/create.ts` | Neuer NotificationType `'whatsapp_inbound'` |
| `vercel.json` | Zwei neue Cron-Eintraege |

---

### Task 1: Migration — WhatsApp-Tabellen, RLS, Realtime, Claim-Funktionen

**Files:**
- Create: `supabase/migrations/20260921000008_whatsapp_inbox.sql`

**Interfaces:**
- Consumes: bestehende Tabellen `agencies`, `candidates`, `users`, `events_inbox`, `scheduled_jobs`; RLS-Helper `can_access_agency(uuid)`, `can_write_agency(uuid)`.
- Produces: Tabellen `whatsapp_accounts`, `whatsapp_templates`, `conversations`, `messages`, `quick_replies`; Postgres-Funktionen `claim_inbox_events(int)` und `claim_due_jobs(int)`; Supabase Realtime auf `messages` und `conversations`.

- [ ] **Step 1: Migrationsdatei schreiben**

Erstelle `supabase/migrations/20260921000008_whatsapp_inbox.sql` mit folgendem Inhalt:

```sql
-- Phase 2 / Spec Abschn. 4+7+9: WhatsApp-Tabellen, Conversations, Messages, Quick Replies.

-- 1. whatsapp_accounts
CREATE TABLE whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL,
  display_number text,
  access_token_enc text NOT NULL,
  provider text NOT NULL DEFAULT 'cloud_api',
  quality_rating text,
  messaging_limit text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','disconnected','banned')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_accounts_agency ON whatsapp_accounts(agency_id);
CREATE UNIQUE INDEX uq_wa_accounts_phone ON whatsapp_accounts(phone_number_id);
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_accounts select" ON whatsapp_accounts FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "wa_accounts write" ON whatsapp_accounts FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 2. whatsapp_templates
CREATE TABLE whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  wa_account_id uuid NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'de',
  category text NOT NULL DEFAULT 'UTILITY',
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]',
  buttons jsonb,
  meta_template_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paused','deleted')),
  preset_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_templates_account ON whatsapp_templates(wa_account_id);
CREATE INDEX idx_wa_templates_agency ON whatsapp_templates(agency_id);
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_templates select" ON whatsapp_templates FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "wa_templates write" ON whatsapp_templates FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 3. conversations
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  wa_account_id uuid NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'bot_active' CHECK (state IN ('bot_active','human_active','waiting','closed')),
  bot_step int NOT NULL DEFAULT 0,
  window_expires_at timestamptz,
  unread_count int NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_conversations_account_candidate ON conversations(wa_account_id, candidate_id);
CREATE INDEX idx_conversations_agency_last ON conversations(agency_id, last_message_at DESC);
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations select" ON conversations FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "conversations write" ON conversations FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 4. messages
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  sender_type text NOT NULL CHECK (sender_type IN ('candidate','bot','user','system')),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text','template','image','document','audio','interactive')),
  body text,
  media_path text,
  wa_message_id text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','read','failed')),
  error_code text,
  template_id uuid REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  cost_category text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_messages_wa_id ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX idx_messages_conversation_time ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_agency ON messages(agency_id);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages select" ON messages FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "messages write" ON messages FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 5. quick_replies
CREATE TABLE quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  shortcut text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quick_replies select" ON quick_replies FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "quick_replies write" ON quick_replies FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 6. Realtime aktivieren
ALTER PUBLICATION supabase_realtime ADD TABLE messages, conversations;

-- 7. Claim-Funktionen fuer den Tick-Cron (atomar, skip locked)
CREATE OR REPLACE FUNCTION claim_inbox_events(batch_size int DEFAULT 100)
RETURNS SETOF events_inbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE events_inbox
  SET status = 'processing', attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM events_inbox
    WHERE status = 'pending'
    ORDER BY received_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION claim_due_jobs(batch_size int DEFAULT 100)
RETURNS SETOF scheduled_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE scheduled_jobs
  SET status = 'processing', attempts = attempts + 1, updated_at = now()
  WHERE id IN (
    SELECT id FROM scheduled_jobs
    WHERE status = 'pending' AND run_at <= now()
    ORDER BY run_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- 8. Storage-Bucket fuer WhatsApp-Medien (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('whatsapp-media', 'whatsapp-media', false)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Pruefen ob Build weiterhin gruen ist**

Run: `npm run build && npx vitest run`
Expected: Build und alle 38 Tests gruen (keine bestehende Abhaengigkeit auf die neuen Tabellen).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260921000008_whatsapp_inbox.sql
git commit -m "feat: Phase 2 migration — WhatsApp tables, RLS, Realtime, claim functions"
```

---

### Task 2: Crypto-Modul (AES-256-GCM)

**Files:**
- Create: `src/lib/crypto.ts`
- Create: `src/lib/recruiting/__tests__/crypto.test.ts`

**Interfaces:**
- Consumes: Env-Variable `ENCRYPTION_KEY` (64 Hex-Zeichen = 32 Bytes).
- Produces: `encryptSecret(plain: string): string` (Format `iv:tag:ciphertext` Base64), `decryptSecret(enc: string): string`. Wird von Task 7 (Embedded Signup) und Task 8 (Manual Connect) verwendet.

- [ ] **Step 1: Failing Test schreiben**

Erstelle `src/lib/recruiting/__tests__/crypto.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set test encryption key before importing module
const TEST_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

describe('crypto', () => {
  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('roundtrip: decrypt(encrypt(plain)) === plain', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/crypto');
    const plain = 'EAABsbCS1iZAg_test_token_12345';
    const encrypted = encryptSecret(plain);
    expect(encrypted).not.toBe(plain);
    expect(encrypted.split(':').length).toBe(3);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plain);
  });

  it('different encryptions produce different ciphertexts (random IV)', async () => {
    const { encryptSecret } = await import('@/lib/crypto');
    const plain = 'same_token';
    const a = encryptSecret(plain);
    const b = encryptSecret(plain);
    expect(a).not.toBe(b);
  });

  it('throws German error when ENCRYPTION_KEY missing', async () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    // Force fresh import
    vi.resetModules();
    const mod = await import('@/lib/crypto');
    expect(() => mod.encryptSecret('x')).toThrow('ENCRYPTION_KEY');
  });

  it('throws German error when ENCRYPTION_KEY has wrong length', async () => {
    vi.stubEnv('ENCRYPTION_KEY', 'tooshort');
    vi.resetModules();
    const mod = await import('@/lib/crypto');
    expect(() => mod.encryptSecret('x')).toThrow('64 Hex-Zeichen');
  });

  it('decryptSecret throws on tampered ciphertext', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/crypto');
    const encrypted = encryptSecret('test');
    const parts = encrypted.split(':');
    parts[2] = 'AAAA' + parts[2].slice(4); // tamper ciphertext
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });
});
```

- [ ] **Step 2: Test ausfuehren — muss fehlschlagen**

Run: `npx vitest run src/lib/recruiting/__tests__/crypto.test.ts`
Expected: FAIL — Modul `@/lib/crypto` existiert nicht.

- [ ] **Step 3: Implementierung schreiben**

Erstelle `src/lib/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY fehlt oder hat nicht die erwarteten 64 Hex-Zeichen. ' +
      'Bitte als Umgebungsvariable setzen (openssl rand -hex 32).'
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Verschluesselt einen Klartext-String mit AES-256-GCM.
 * Rueckgabe: `iv:tag:ciphertext` (alle Base64-kodiert).
 */
export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Entschluesselt einen mit encryptSecret() verschluesselten String.
 */
export function decryptSecret(enc: string): string {
  const key = getKey();
  const parts = enc.split(':');
  if (parts.length !== 3) {
    throw new Error('Ungueltiges Verschluesselungsformat (erwartet iv:tag:ciphertext)');
  }
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
```

- [ ] **Step 4: Tests ausfuehren — muessen gruen sein**

Run: `npx vitest run src/lib/recruiting/__tests__/crypto.test.ts`
Expected: Alle 5 Tests PASS.

- [ ] **Step 5: Gesamte Suite pruefen**

Run: `npx vitest run`
Expected: Alle Tests gruen (38 bestehende + 5 neue).

- [ ] **Step 6: Commit**

```bash
git add src/lib/crypto.ts src/lib/recruiting/__tests__/crypto.test.ts
git commit -m "feat: AES-256-GCM crypto module for WhatsApp token encryption"
```

---

### Task 3: WhatsApp Provider-Abstraktion

**Files:**
- Create: `src/lib/whatsapp/provider.ts`

**Interfaces:**
- Consumes: Env `WHATSAPP_API_BASE_URL` (default `https://graph.facebook.com/v23.0`), `decryptSecret()` aus Task 2.
- Produces: `WhatsAppProvider` Interface mit Methoden: `sendMessage(phoneNumberId, token, payload): Promise<{messageId: string}>`, `uploadMedia(phoneNumberId, token, file, mime): Promise<{mediaId: string}>`, `getMediaUrl(mediaId, token): Promise<string>`, `createTemplate(wabaId, token, template): Promise<{id: string}>`, `listTemplates(wabaId, token): Promise<TemplateStatus[]>`, `registerPhone(phoneNumberId, token): Promise<void>`, `subscribeWebhook(wabaId, token): Promise<void>`, `exchangeCode(code, appId, appSecret): Promise<{accessToken: string; wabaId: string; phoneNumberId: string}>`. `CloudApiProvider` Klasse implementiert dieses Interface. `getProvider(): WhatsAppProvider` Fabrik-Funktion.

- [ ] **Step 1: Provider-Datei schreiben**

Erstelle `src/lib/whatsapp/provider.ts`:

```ts
/**
 * WhatsApp Cloud API Provider — Spec Abschn. 7, Integration-Design Annahme.
 * Alle Meta-Aufrufe gehen ueber dieses Interface, damit Direktanbindung und
 * BSP austauschbar bleiben.
 */

export interface SendMessagePayload {
  to: string; // E.164
  type: 'text' | 'template' | 'image' | 'document' | 'audio' | 'interactive';
  text?: { body: string };
  template?: {
    name: string;
    language: { code: string };
    components?: Array<Record<string, unknown>>;
  };
  image?: { id?: string; link?: string; caption?: string };
  document?: { id?: string; link?: string; filename?: string; caption?: string };
  audio?: { id?: string; link?: string };
  interactive?: Record<string, unknown>;
}

export interface SendMessageResult {
  messageId: string;
}

export interface TemplateDefinition {
  name: string;
  language: string;
  category: string;
  components: Array<Record<string, unknown>>;
}

export interface TemplateStatus {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
}

export interface WhatsAppProvider {
  sendMessage(phoneNumberId: string, token: string, payload: SendMessagePayload): Promise<SendMessageResult>;
  uploadMedia(phoneNumberId: string, token: string, file: Buffer, mimeType: string, filename: string): Promise<{ mediaId: string }>;
  getMediaUrl(mediaId: string, token: string): Promise<string>;
  createTemplate(wabaId: string, token: string, template: TemplateDefinition): Promise<{ id: string }>;
  listTemplates(wabaId: string, token: string): Promise<TemplateStatus[]>;
  registerPhone(phoneNumberId: string, token: string): Promise<void>;
  subscribeWebhook(wabaId: string, token: string): Promise<void>;
  exchangeCode(code: string, appId: string, appSecret: string): Promise<{ accessToken: string; wabaId: string; phoneNumberId: string }>;
}

const BASE_URL = process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com/v23.0';

async function metaFetch(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => 'Keine Details');
    throw new Error(`WhatsApp API Fehler ${res.status}: ${body}`);
  }
  return res;
}

export class CloudApiProvider implements WhatsAppProvider {
  async sendMessage(phoneNumberId: string, token: string, payload: SendMessagePayload): Promise<SendMessageResult> {
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...payload,
    };
    const res = await metaFetch(`/${phoneNumberId}/messages`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { messageId: data.messages?.[0]?.id || '' };
  }

  async uploadMedia(phoneNumberId: string, token: string, file: Buffer, mimeType: string, filename: string): Promise<{ mediaId: string }> {
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    formData.append('file', new Blob([file], { type: mimeType }), filename);
    const res = await metaFetch(`/${phoneNumberId}/media`, token, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    return { mediaId: data.id };
  }

  async getMediaUrl(mediaId: string, token: string): Promise<string> {
    const res = await metaFetch(`/${mediaId}`, token);
    const data = await res.json();
    return data.url;
  }

  async createTemplate(wabaId: string, token: string, template: TemplateDefinition): Promise<{ id: string }> {
    const res = await metaFetch(`/${wabaId}/message_templates`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    const data = await res.json();
    return { id: data.id };
  }

  async listTemplates(wabaId: string, token: string): Promise<TemplateStatus[]> {
    const res = await metaFetch(`/${wabaId}/message_templates?limit=100`, token);
    const data = await res.json();
    return (data.data || []).map((t: Record<string, unknown>) => ({
      id: t.id as string,
      name: t.name as string,
      status: t.status as string,
      category: t.category as string,
      language: t.language as string,
    }));
  }

  async registerPhone(phoneNumberId: string, token: string): Promise<void> {
    await metaFetch(`/${phoneNumberId}/register`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin: '000000' }),
    });
  }

  async subscribeWebhook(wabaId: string, token: string): Promise<void> {
    await metaFetch(`/${wabaId}/subscribed_apps`, token, { method: 'POST' });
  }

  async exchangeCode(code: string, appId: string, appSecret: string): Promise<{ accessToken: string; wabaId: string; phoneNumberId: string }> {
    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v23.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}`
    );
    if (!tokenRes.ok) {
      throw new Error('Token-Austausch fehlgeschlagen: ' + await tokenRes.text());
    }
    const tokenData = await tokenRes.json();
    const shortToken = tokenData.access_token;

    // Step 2: Exchange for long-lived token
    const longRes = await fetch(
      `https://graph.facebook.com/v23.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
    );
    if (!longRes.ok) {
      throw new Error('Long-lived Token fehlgeschlagen: ' + await longRes.text());
    }
    const longData = await longRes.json();
    const accessToken = longData.access_token;

    // Step 3: Get debug token info to extract WABA and phone number
    const debugRes = await metaFetch('/debug_token?input_token=' + accessToken, accessToken);
    const debugData = await debugRes.json();
    const granularScopes = debugData.data?.granular_scopes || [];
    const whatsappScope = granularScopes.find((s: Record<string, unknown>) => s.scope === 'whatsapp_business_management');
    const wabaId = whatsappScope?.target_ids?.[0] || '';

    // Step 4: Get phone numbers for this WABA
    const phonesRes = await metaFetch(`/${wabaId}/phone_numbers`, accessToken);
    const phonesData = await phonesRes.json();
    const phoneNumberId = phonesData.data?.[0]?.id || '';

    return { accessToken, wabaId, phoneNumberId };
  }
}

let providerInstance: WhatsAppProvider | null = null;

export function getProvider(): WhatsAppProvider {
  if (!providerInstance) {
    providerInstance = new CloudApiProvider();
  }
  return providerInstance;
}
```

- [ ] **Step 2: Build pruefen**

Run: `npm run build && npx vitest run`
Expected: Build gruen, alle bestehenden Tests gruen.

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp/provider.ts
git commit -m "feat: WhatsApp Cloud API provider abstraction"
```

---

### Task 4: WhatsApp-Webhook (GET Verify + POST Events -> events_inbox)

**Files:**
- Create: `src/app/api/webhooks/whatsapp/route.ts`
- Create: `src/lib/recruiting/__tests__/webhook.test.ts`

**Interfaces:**
- Consumes: Env `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`; `createAdminClient()` aus `src/lib/supabase/admin`; `verifyMetaSignature()` Pattern aus `src/app/api/webhooks/meta/route.ts`.
- Produces: GET endpoint (hub.challenge), POST endpoint (HMAC-verifiziert, schreibt in `events_inbox` mit source `'whatsapp'` und gibt 200 zurueck).

- [ ] **Step 1: Webhook-Signatur-Tests schreiben**

Erstelle `src/lib/recruiting/__tests__/webhook.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';

/**
 * Standalone-Tests fuer die Webhook-Signatur-Logik.
 * Wir testen die reine Funktion, nicht die Route (Supabase-Mock waere noetig).
 */

function verifyWhatsAppSignature(rawBody: string, sigHeader: string | null, appSecret: string): boolean {
  if (!sigHeader || !sigHeader.startsWith('sha256=')) return false;
  const received = sigHeader.slice('sha256='.length);
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const receivedBuf = Buffer.from(received);
  const expectedBuf = Buffer.from(expected);
  return receivedBuf.length === expectedBuf.length &&
    require('crypto').timingSafeEqual(receivedBuf, expectedBuf);
}

const TEST_SECRET = 'test_app_secret_12345';

describe('WhatsApp webhook signature verification', () => {
  it('accepts valid HMAC-SHA256 signature', () => {
    const body = '{"entry":[{"changes":[]}]}';
    const sig = 'sha256=' + createHmac('sha256', TEST_SECRET).update(body).digest('hex');
    expect(verifyWhatsAppSignature(body, sig, TEST_SECRET)).toBe(true);
  });

  it('rejects invalid signature', () => {
    const body = '{"entry":[]}';
    expect(verifyWhatsAppSignature(body, 'sha256=deadbeef', TEST_SECRET)).toBe(false);
  });

  it('rejects null signature header', () => {
    expect(verifyWhatsAppSignature('{}', null, TEST_SECRET)).toBe(false);
  });

  it('rejects signature without sha256= prefix', () => {
    const body = '{}';
    const hash = createHmac('sha256', TEST_SECRET).update(body).digest('hex');
    expect(verifyWhatsAppSignature(body, hash, TEST_SECRET)).toBe(false);
  });
});

describe('STOP detection', () => {
  const STOP_WORDS = ['stop', 'stopp', 'abmelden', 'STOP', 'STOPP', 'Stopp', 'Stop'];

  function isStopMessage(text: string | null | undefined): boolean {
    if (!text) return false;
    return ['stop', 'stopp', 'abmelden'].includes(text.trim().toLowerCase());
  }

  it.each(STOP_WORDS)('detects "%s" as STOP', (word) => {
    expect(isStopMessage(word)).toBe(true);
  });

  it('does not flag normal messages', () => {
    expect(isStopMessage('Hallo, ich bin interessiert')).toBe(false);
    expect(isStopMessage('Ich stoppe mal kurz')).toBe(false);
  });

  it('handles null/undefined', () => {
    expect(isStopMessage(null)).toBe(false);
    expect(isStopMessage(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Tests ausfuehren — muessen PASS**

Run: `npx vitest run src/lib/recruiting/__tests__/webhook.test.ts`
Expected: Alle 8 Tests PASS (standalone Funktionen, kein fehlender Import).

- [ ] **Step 3: Webhook-Route implementieren**

Erstelle `src/app/api/webhooks/whatsapp/route.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

function verifySignature(rawBody: string, sigHeader: string | null, appSecret: string): boolean {
  if (!sigHeader || !sigHeader.startsWith('sha256=')) return false;
  const received = sigHeader.slice('sha256='.length);
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const receivedBuf = Buffer.from(received);
  const expectedBuf = Buffer.from(expected);
  return receivedBuf.length === expectedBuf.length && timingSafeEqual(receivedBuf, expectedBuf);
}

// Meta webhook verification (hub.challenge)
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// Receive WhatsApp events: messages, statuses, template updates
export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    // Degraded mode — webhook nicht konfiguriert
    return NextResponse.json({ error: 'Webhook nicht konfiguriert' }, { status: 500 });
  }

  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 401 });
  }

  // Sofort 200 antworten — Verarbeitung passiert asynchron ueber events_inbox.
  // Wir parsen und schreiben in die Queue, aber kehren in <2s zurueck.
  const body = JSON.parse(rawBody);
  const supabase = createAdminClient();

  const entries = body?.entry || [];
  for (const entry of entries) {
    const changes = entry?.changes || [];
    for (const change of changes) {
      if (change.field !== 'messages') continue;

      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;

      // Agency ueber phone_number_id -> whatsapp_accounts aufloesen
      let agencyId: string | null = null;
      if (phoneNumberId) {
        const { data: waAccount } = await supabase
          .from('whatsapp_accounts')
          .select('agency_id')
          .eq('phone_number_id', phoneNumberId)
          .maybeSingle();
        agencyId = waAccount?.agency_id || null;
      }

      // Eingehende Nachrichten
      const messages = value.messages || [];
      for (const msg of messages) {
        await supabase.from('events_inbox').insert({
          source: 'whatsapp',
          external_id: msg.id || null,
          agency_id: agencyId,
          payload: { type: 'whatsapp.inbound', phone_number_id: phoneNumberId, message: msg, contacts: value.contacts },
          status: 'pending',
        });
      }

      // Status-Updates (sent, delivered, read, failed)
      const statuses = value.statuses || [];
      for (const status of statuses) {
        await supabase.from('events_inbox').insert({
          source: 'whatsapp',
          external_id: `status_${status.id}_${status.status}`,
          agency_id: agencyId,
          payload: { type: 'whatsapp.status', phone_number_id: phoneNumberId, status },
          status: 'pending',
        });
      }
    }

    // Template-Status-Updates (separates change.field)
    const templateChanges = (entry?.changes || []).filter(
      (c: Record<string, unknown>) => c.field === 'message_template_status_update'
    );
    for (const tc of templateChanges) {
      await supabase.from('events_inbox').insert({
        source: 'whatsapp',
        external_id: `tmpl_${tc.value?.message_template_id}_${tc.value?.event}`,
        agency_id: null,
        payload: { type: 'whatsapp.template_status', ...tc.value },
        status: 'pending',
      });
    }
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Build pruefen**

Run: `npm run build && npx vitest run`
Expected: Build gruen, alle Tests gruen.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/whatsapp/route.ts src/lib/recruiting/__tests__/webhook.test.ts
git commit -m "feat: WhatsApp webhook route with HMAC verification and events_inbox enqueue"
```

---

### Task 5: Fensterlogik, Preflight, STOP-Erkennung + Send-Funktion

**Files:**
- Create: `src/lib/whatsapp/window.ts`
- Create: `src/lib/whatsapp/send.ts`
- Create: `src/lib/recruiting/__tests__/window.test.ts`

**Interfaces:**
- Consumes: `getProvider()` aus Task 3; `createAdminClient()`.
- Produces: `isWindowOpen(windowExpiresAt: string | null): boolean`; `isQuietHours(timezone: string): boolean`; `isStopMessage(text: string | null | undefined): boolean`; `PreflightResult = { ok: boolean; reason?: string }`; `checkPreflight(opts: PreflightOpts): PreflightResult`; `sendWhatsAppMessage(svc, opts: SendOpts): Promise<{messageId: string; messageRowId: string}>` — einziger Ausgangsweg fuer alle WhatsApp-Nachrichten.

- [ ] **Step 1: Fensterlogik + Preflight Tests schreiben**

Erstelle `src/lib/recruiting/__tests__/window.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('window logic', () => {
  it('isWindowOpen returns true when window_expires_at is in the future', async () => {
    const { isWindowOpen } = await import('@/lib/whatsapp/window');
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(isWindowOpen(future)).toBe(true);
  });

  it('isWindowOpen returns false when window_expires_at is in the past', async () => {
    const { isWindowOpen } = await import('@/lib/whatsapp/window');
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isWindowOpen(past)).toBe(false);
  });

  it('isWindowOpen returns false when null', async () => {
    const { isWindowOpen } = await import('@/lib/whatsapp/window');
    expect(isWindowOpen(null)).toBe(false);
  });
});

describe('quiet hours', () => {
  it('returns false during business hours (12:00 Europe/Berlin on Wednesday)', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    // Mock: Mittwoch 12:00 Berlin
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:00Z')); // 12:00 Berlin (UTC+2)
    expect(isQuietHours('Europe/Berlin')).toBe(false);
    vi.useRealTimers();
  });

  it('returns true at 22:00 on a weekday', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T20:00:00Z')); // 22:00 Berlin
    expect(isQuietHours('Europe/Berlin')).toBe(true);
    vi.useRealTimers();
  });

  it('returns true on Sunday', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z')); // Sonntag 12:00 Berlin
    expect(isQuietHours('Europe/Berlin')).toBe(true);
    vi.useRealTimers();
  });
});

describe('STOP detection', () => {
  it.each(['stop', 'STOP', 'Stopp', 'stopp', 'STOPP', 'abmelden', 'Abmelden'])(
    'detects "%s" as STOP message', async (word) => {
      const { isStopMessage } = await import('@/lib/whatsapp/window');
      expect(isStopMessage(word)).toBe(true);
    }
  );

  it('does not flag partial matches', async () => {
    const { isStopMessage } = await import('@/lib/whatsapp/window');
    expect(isStopMessage('Ich stoppe mal kurz')).toBe(false);
    expect(isStopMessage('Bitte nicht stoppen')).toBe(false);
  });
});

describe('preflight checks', () => {
  it('rejects when consent_whatsapp is false', async () => {
    const { checkPreflight } = await import('@/lib/whatsapp/window');
    const result = checkPreflight({
      consentWhatsapp: false,
      windowExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      isTemplate: false,
      isHumanUiSend: false,
      timezone: 'Europe/Berlin',
      accountConnected: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Einwilligung');
  });

  it('rejects free text with closed window', async () => {
    const { checkPreflight } = await import('@/lib/whatsapp/window');
    const result = checkPreflight({
      consentWhatsapp: true,
      windowExpiresAt: new Date(Date.now() - 1000).toISOString(),
      isTemplate: false,
      isHumanUiSend: false,
      timezone: 'Europe/Berlin',
      accountConnected: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Fenster');
  });

  it('allows template with closed window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:00Z')); // Mittwoch 12:00 Berlin
    const { checkPreflight } = await import('@/lib/whatsapp/window');
    const result = checkPreflight({
      consentWhatsapp: true,
      windowExpiresAt: new Date(Date.now() - 1000).toISOString(),
      isTemplate: true,
      isHumanUiSend: false,
      timezone: 'Europe/Berlin',
      accountConnected: true,
    });
    expect(result.ok).toBe(true);
    vi.useRealTimers();
  });

  it('rejects automated send during quiet hours', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T20:00:00Z')); // 22:00 Berlin
    const { checkPreflight } = await import('@/lib/whatsapp/window');
    const result = checkPreflight({
      consentWhatsapp: true,
      windowExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      isTemplate: true,
      isHumanUiSend: false,
      timezone: 'Europe/Berlin',
      accountConnected: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Ruhezeit');
    vi.useRealTimers();
  });

  it('allows human UI send during quiet hours (exempt)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T20:00:00Z')); // 22:00 Berlin
    const { checkPreflight } = await import('@/lib/whatsapp/window');
    const result = checkPreflight({
      consentWhatsapp: true,
      windowExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      isTemplate: true,
      isHumanUiSend: true,
      timezone: 'Europe/Berlin',
      accountConnected: true,
    });
    expect(result.ok).toBe(true);
    vi.useRealTimers();
  });

  it('rejects when account not connected', async () => {
    const { checkPreflight } = await import('@/lib/whatsapp/window');
    const result = checkPreflight({
      consentWhatsapp: true,
      windowExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      isTemplate: false,
      isHumanUiSend: false,
      timezone: 'Europe/Berlin',
      accountConnected: false,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('verbunden');
  });
});
```

- [ ] **Step 2: Tests ausfuehren — muessen fehlschlagen**

Run: `npx vitest run src/lib/recruiting/__tests__/window.test.ts`
Expected: FAIL — Modul `@/lib/whatsapp/window` existiert nicht.

- [ ] **Step 3: Fensterlogik implementieren**

Erstelle `src/lib/whatsapp/window.ts`:

```ts
/**
 * 24h-Fensterlogik, Preflight-Checks und STOP-Erkennung.
 * Spec Abschn. 7: Nachrichtenregeln.
 */

export function isWindowOpen(windowExpiresAt: string | null): boolean {
  if (!windowExpiresAt) return false;
  return new Date(windowExpiresAt).getTime() > Date.now();
}

/**
 * Prueft ob gerade Ruhezeit ist (Standard 20:00–08:00 Ortszeit Mo–Sa, Sonntag ganztaegig).
 * Verwendet Intl API — keine npm-Dependency.
 */
export function isQuietHours(timezone: string): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';

  // Sonntag = ganzer Tag Ruhezeit
  if (weekday === 'Sun') return true;

  // Mo–Sa: 08:00 bis 20:00 sind Geschaeftszeiten
  return hour < 8 || hour >= 20;
}

const STOP_WORDS = new Set(['stop', 'stopp', 'abmelden']);

/**
 * Prueft ob eine eingehende Nachricht ein Opt-out (STOP) ist.
 * Case-insensitive, exakte Uebereinstimmung (kein Teilstring).
 */
export function isStopMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  return STOP_WORDS.has(text.trim().toLowerCase());
}

export interface PreflightOpts {
  consentWhatsapp: boolean;
  windowExpiresAt: string | null;
  isTemplate: boolean;
  /** true wenn ein Recruiter die Nachricht manuell im UI sendet (Ruhezeiten-Ausnahme) */
  isHumanUiSend: boolean;
  timezone: string;
  accountConnected: boolean;
}

export interface PreflightResult {
  ok: boolean;
  reason?: string;
}

/**
 * Preflight-Pruefung vor jedem Versand. Spec Abschn. 7.
 * Reihenfolge: Account -> Consent -> Fenster/Vorlage -> Ruhezeiten.
 */
export function checkPreflight(opts: PreflightOpts): PreflightResult {
  if (!opts.accountConnected) {
    return { ok: false, reason: 'WhatsApp-Konto nicht verbunden' };
  }
  if (!opts.consentWhatsapp) {
    return { ok: false, reason: 'Keine WhatsApp-Einwilligung vorhanden' };
  }
  if (!opts.isTemplate && !isWindowOpen(opts.windowExpiresAt)) {
    return { ok: false, reason: '24-Stunden-Fenster geschlossen — nur Vorlagen erlaubt' };
  }
  // Ruhezeiten binden automatisierte Sends; manueller UI-Versand durch Recruiter ist ausgenommen
  if (!opts.isHumanUiSend && isQuietHours(opts.timezone)) {
    return { ok: false, reason: 'Ruhezeit (08:00–20:00 Mo–Sa) — automatischer Versand gesperrt' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Send-Funktion implementieren**

Erstelle `src/lib/whatsapp/send.ts`:

```ts
/**
 * Einziger Ausgangsweg fuer alle WhatsApp-Nachrichten.
 * Fuehrt Preflight-Checks durch und schreibt die Message-Row.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { checkPreflight, type PreflightResult } from './window';
import { getProvider, type SendMessagePayload } from './provider';
import { decryptSecret } from '@/lib/crypto';

export interface SendOpts {
  agencyId: string;
  conversationId: string;
  candidatePhone: string;
  waAccountId: string;
  payload: SendMessagePayload;
  senderType: 'bot' | 'user' | 'system';
  userId?: string | null;
  templateId?: string | null;
  /** true wenn ein Recruiter die Nachricht manuell im UI sendet */
  isHumanUiSend?: boolean;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  messageRowId?: string;
  error?: string;
}

export async function sendWhatsAppMessage(
  svc: SupabaseClient,
  opts: SendOpts
): Promise<SendResult> {
  // 1. WhatsApp-Account laden
  const { data: waAccount } = await svc
    .from('whatsapp_accounts')
    .select('id, phone_number_id, access_token_enc, status')
    .eq('id', opts.waAccountId)
    .single();

  if (!waAccount) {
    return { ok: false, error: 'WhatsApp-Konto nicht gefunden' };
  }

  // 2. Conversation + Candidate laden fuer Preflight
  const { data: conv } = await svc
    .from('conversations')
    .select('window_expires_at, candidate_id')
    .eq('id', opts.conversationId)
    .single();

  if (!conv) {
    return { ok: false, error: 'Konversation nicht gefunden' };
  }

  const { data: candidate } = await svc
    .from('candidates')
    .select('whatsapp_opt_in')
    .eq('id', conv.candidate_id)
    .single();

  // 3. Agency-Timezone laden
  const { data: agency } = await svc
    .from('agencies')
    .select('timezone')
    .eq('id', opts.agencyId)
    .single();

  const timezone = agency?.timezone || 'Europe/Berlin';

  // 4. Preflight
  const isTemplate = opts.payload.type === 'template';
  const preflight: PreflightResult = checkPreflight({
    consentWhatsapp: candidate?.whatsapp_opt_in ?? false,
    windowExpiresAt: conv.window_expires_at,
    isTemplate,
    isHumanUiSend: opts.isHumanUiSend ?? false,
    timezone,
    accountConnected: waAccount.status === 'connected',
  });

  if (!preflight.ok) {
    return { ok: false, error: preflight.reason };
  }

  // 5. Message-Row anlegen (status queued)
  const bodyText = opts.payload.text?.body
    || opts.payload.template?.name
    || (opts.payload.type === 'image' ? '[Bild]' : opts.payload.type === 'document' ? '[Dokument]' : '[Nachricht]');

  const { data: msgRow, error: insertErr } = await svc
    .from('messages')
    .insert({
      agency_id: opts.agencyId,
      conversation_id: opts.conversationId,
      direction: 'out',
      sender_type: opts.senderType,
      user_id: opts.userId || null,
      type: opts.payload.type,
      body: bodyText,
      status: 'queued',
      template_id: opts.templateId || null,
      cost_category: isTemplate ? 'utility' : 'service',
    })
    .select('id')
    .single();

  if (insertErr || !msgRow) {
    return { ok: false, error: 'Nachricht konnte nicht gespeichert werden' };
  }

  // 6. An Provider senden
  try {
    const token = decryptSecret(waAccount.access_token_enc);
    const provider = getProvider();
    const result = await provider.sendMessage(waAccount.phone_number_id, token, opts.payload);

    // 7. Message-Row aktualisieren
    await svc.from('messages')
      .update({ wa_message_id: result.messageId, status: 'sent' })
      .eq('id', msgRow.id);

    // 8. Conversation aktualisieren
    await svc.from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', opts.conversationId);

    return { ok: true, messageId: result.messageId, messageRowId: msgRow.id };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    await svc.from('messages')
      .update({ status: 'failed', error_code: errorMsg })
      .eq('id', msgRow.id);

    return { ok: false, messageRowId: msgRow.id, error: errorMsg };
  }
}
```

- [ ] **Step 5: Tests ausfuehren — muessen jetzt PASS sein**

Run: `npx vitest run src/lib/recruiting/__tests__/window.test.ts`
Expected: Alle Tests PASS.

- [ ] **Step 6: Gesamte Suite pruefen**

Run: `npm run build && npx vitest run`
Expected: Build gruen, alle Tests gruen.

- [ ] **Step 7: Commit**

```bash
git add src/lib/whatsapp/window.ts src/lib/whatsapp/send.ts src/lib/recruiting/__tests__/window.test.ts
git commit -m "feat: WhatsApp window logic, preflight checks, STOP detection and send function"
```

---

### Task 6: Worker-Funktionen + Tick-Cron

**Files:**
- Create: `src/lib/workers/whatsapp-inbound.ts`
- Create: `src/lib/workers/whatsapp-status.ts`
- Create: `src/lib/workers/whatsapp-send.ts`
- Create: `src/lib/workers/media-download.ts`
- Create: `src/app/api/cron/tick/route.ts`

**Interfaces:**
- Consumes: `claim_inbox_events(int)` und `claim_due_jobs(int)` (Postgres-Funktionen aus Task 1); `createAdminClient()`; `sendWhatsAppMessage()` aus Task 5; `isStopMessage()` aus Task 5; `getProvider()` aus Task 3; `decryptSecret()` aus Task 2; `createNotificationForAgency()` und `createNotification()` aus `src/lib/notifications/create.ts`.
- Produces: `processInbound(svc, event)`, `processStatus(svc, event)`, `processSend(svc, job)`, `processMediaDownload(svc, job)` Worker-Funktionen; `/api/cron/tick` GET-Endpoint mit CRON_SECRET Bearer Auth.

- [ ] **Step 1: Inbound-Worker schreiben**

Erstelle `src/lib/workers/whatsapp-inbound.ts`:

```ts
/**
 * Worker: eingehende WhatsApp-Nachricht verarbeiten.
 * Speichert Message, upserted Conversation, setzt window_expires_at,
 * erkennt STOP, aktualisiert unread_count, erstellt Benachrichtigung.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { isStopMessage } from '@/lib/whatsapp/window';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { createNotification, createNotificationForAgency } from '@/lib/notifications/create';

interface InboundPayload {
  type: 'whatsapp.inbound';
  phone_number_id: string;
  message: {
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    image?: { id: string; mime_type: string; caption?: string };
    document?: { id: string; mime_type: string; filename: string; caption?: string };
    audio?: { id: string; mime_type: string };
  };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
}

export async function processInbound(svc: SupabaseClient, agencyId: string, payload: InboundPayload) {
  const msg = payload.message;
  const senderPhone = msg.from.startsWith('+') ? msg.from : `+${msg.from}`;

  // 1. WhatsApp-Account aufloesen
  const { data: waAccount } = await svc
    .from('whatsapp_accounts')
    .select('id, agency_id')
    .eq('phone_number_id', payload.phone_number_id)
    .single();

  if (!waAccount) {
    throw new Error(`Kein WhatsApp-Account für phone_number_id ${payload.phone_number_id}`);
  }

  const effectiveAgencyId = agencyId || waAccount.agency_id;

  // 2. Candidate finden (phone_e164 im Mandanten)
  const { data: candidate } = await svc
    .from('candidates')
    .select('id, name, whatsapp_opt_in')
    .eq('agency_id', effectiveAgencyId)
    .eq('phone_e164', senderPhone)
    .is('deleted_at', null)
    .maybeSingle();

  if (!candidate) {
    // Unbekannte Nummer — kein Kandidat im System. Event als done markieren.
    return;
  }

  // 3. Conversation upsert
  const windowExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: existingConv } = await svc
    .from('conversations')
    .select('id, state, assigned_to, unread_count')
    .eq('wa_account_id', waAccount.id)
    .eq('candidate_id', candidate.id)
    .maybeSingle();

  let conversationId: string;
  let assignedTo: string | null = null;

  if (existingConv) {
    conversationId = existingConv.id;
    assignedTo = existingConv.assigned_to;
    await svc.from('conversations').update({
      window_expires_at: windowExpires,
      unread_count: (existingConv.unread_count || 0) + 1,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId);
  } else {
    const { data: newConv, error: convErr } = await svc
      .from('conversations')
      .insert({
        agency_id: effectiveAgencyId,
        candidate_id: candidate.id,
        wa_account_id: waAccount.id,
        state: 'waiting',
        window_expires_at: windowExpires,
        unread_count: 1,
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (convErr || !newConv) throw new Error('Konversation konnte nicht erstellt werden');
    conversationId = newConv.id;
  }

  // 4. Message speichern
  const bodyText = msg.text?.body
    || msg.image?.caption || (msg.type === 'image' ? '[Bild]' : '')
    || msg.document?.caption || (msg.type === 'document' ? '[Dokument]' : '')
    || (msg.type === 'audio' ? '[Sprachnachricht]' : '')
    || '';

  const messageType = (['text', 'image', 'document', 'audio'].includes(msg.type) ? msg.type : 'text') as 'text' | 'image' | 'document' | 'audio';

  await svc.from('messages').insert({
    agency_id: effectiveAgencyId,
    conversation_id: conversationId,
    direction: 'in',
    sender_type: 'candidate',
    type: messageType,
    body: bodyText,
    wa_message_id: msg.id,
    status: 'delivered',
  });

  // 5. STOP-Erkennung
  if (isStopMessage(msg.text?.body)) {
    await svc.from('candidates')
      .update({ whatsapp_opt_in: false })
      .eq('id', candidate.id);

    await svc.from('conversations')
      .update({ state: 'closed', updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Einmalige Abmeldebestaetigung
    await sendWhatsAppMessage(svc, {
      agencyId: effectiveAgencyId,
      conversationId,
      candidatePhone: senderPhone,
      waAccountId: waAccount.id,
      payload: {
        to: senderPhone,
        type: 'text',
        text: { body: 'Du erhältst keine weiteren Nachrichten von uns. Falls du es dir anders überlegst, melde dich jederzeit.' },
      },
      senderType: 'system',
      isHumanUiSend: true, // Exempt from quiet hours — this is a required confirmation
    }).catch(() => {}); // Best effort

    return;
  }

  // 6. Media-Download als scheduled_job planen
  const mediaId = msg.image?.id || msg.document?.id || msg.audio?.id;
  if (mediaId) {
    await svc.from('scheduled_jobs').insert({
      agency_id: effectiveAgencyId,
      run_at: new Date().toISOString(),
      type: 'media.download',
      payload: {
        media_id: mediaId,
        mime_type: msg.image?.mime_type || msg.document?.mime_type || msg.audio?.mime_type,
        message_id: msg.id,
        conversation_id: conversationId,
        wa_account_id: waAccount.id,
      },
      status: 'pending',
    });
  }

  // 7. Benachrichtigungen
  if (assignedTo) {
    // Benachrichtigung an zugewiesenen Recruiter
    await createNotification(svc, {
      user_id: assignedTo,
      agency_id: effectiveAgencyId,
      title: `Neue Nachricht von ${candidate.name}`,
      body: bodyText.slice(0, 100),
      type: 'new_candidate',
      entity_type: 'candidate',
      entity_id: candidate.id,
      push_url: `/inbox?conversation=${conversationId}`,
    }).catch(() => {});
  } else if (!existingConv) {
    // Neue unzugewiesene Konversation — an alle im Mandanten
    await createNotificationForAgency(svc, effectiveAgencyId, {
      title: `Neue WhatsApp-Nachricht von ${candidate.name}`,
      body: bodyText.slice(0, 100),
      type: 'new_candidate',
      entity_type: 'candidate',
      entity_id: candidate.id,
      push_url: `/inbox?conversation=${conversationId}`,
    }).catch(() => {});
  }
}
```

- [ ] **Step 2: Status-Worker schreiben**

Erstelle `src/lib/workers/whatsapp-status.ts`:

```ts
/**
 * Worker: WhatsApp-Zustellstatus aktualisieren.
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface StatusPayload {
  type: 'whatsapp.status';
  phone_number_id: string;
  status: {
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    errors?: Array<{ code: number; title: string }>;
    recipient_id: string;
  };
}

export async function processStatus(svc: SupabaseClient, payload: StatusPayload) {
  const s = payload.status;
  const waMessageId = s.id;

  const updates: Record<string, unknown> = {
    status: s.status,
  };

  if (s.status === 'failed' && s.errors?.length) {
    updates.error_code = `${s.errors[0].code}: ${s.errors[0].title}`;
  }

  await svc.from('messages')
    .update(updates)
    .eq('wa_message_id', waMessageId);
}
```

- [ ] **Step 3: Send-Worker schreiben**

Erstelle `src/lib/workers/whatsapp-send.ts`:

```ts
/**
 * Worker: ausgehende Nachricht senden (aus scheduled_jobs).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';

interface SendJobPayload {
  agency_id: string;
  conversation_id: string;
  candidate_phone: string;
  wa_account_id: string;
  payload: Record<string, unknown>;
  sender_type: 'bot' | 'user' | 'system';
  user_id?: string;
  template_id?: string;
}

export async function processSend(svc: SupabaseClient, jobPayload: SendJobPayload) {
  const result = await sendWhatsAppMessage(svc, {
    agencyId: jobPayload.agency_id,
    conversationId: jobPayload.conversation_id,
    candidatePhone: jobPayload.candidate_phone,
    waAccountId: jobPayload.wa_account_id,
    payload: jobPayload.payload as import('@/lib/whatsapp/provider').SendMessagePayload,
    senderType: jobPayload.sender_type,
    userId: jobPayload.user_id || null,
    templateId: jobPayload.template_id || null,
  });

  if (!result.ok) {
    throw new Error(result.error || 'Versand fehlgeschlagen');
  }
}
```

- [ ] **Step 4: Media-Download-Worker schreiben**

Erstelle `src/lib/workers/media-download.ts`:

```ts
/**
 * Worker: Medien von Meta herunterladen und in private Storage legen.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getProvider } from '@/lib/whatsapp/provider';
import { decryptSecret } from '@/lib/crypto';

interface MediaJobPayload {
  media_id: string;
  mime_type: string;
  message_id: string;
  conversation_id: string;
  wa_account_id: string;
}

export async function processMediaDownload(svc: SupabaseClient, agencyId: string, payload: MediaJobPayload) {
  // 1. Token laden
  const { data: waAccount } = await svc
    .from('whatsapp_accounts')
    .select('access_token_enc, phone_number_id')
    .eq('id', payload.wa_account_id)
    .single();

  if (!waAccount) throw new Error('WhatsApp-Account nicht gefunden');

  const token = decryptSecret(waAccount.access_token_enc);
  const provider = getProvider();

  // 2. Media-URL von Meta holen
  const mediaUrl = await provider.getMediaUrl(payload.media_id, token);

  // 3. Datei herunterladen (mit Bearer Token)
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Media-Download fehlgeschlagen: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());

  // 4. In Supabase Storage hochladen
  const ext = payload.mime_type.split('/')[1] || 'bin';
  const storagePath = `${agencyId}/whatsapp/${payload.conversation_id}/${payload.media_id}.${ext}`;

  const { error: uploadErr } = await svc.storage
    .from('whatsapp-media')
    .upload(storagePath, buffer, { contentType: payload.mime_type });

  if (uploadErr) throw new Error(`Storage-Upload fehlgeschlagen: ${uploadErr.message}`);

  // 5. Message-Row aktualisieren mit media_path
  await svc.from('messages')
    .update({ media_path: storagePath })
    .eq('wa_message_id', payload.message_id);
}
```

- [ ] **Step 5: Tick-Cron implementieren**

Erstelle `src/app/api/cron/tick/route.ts`:

```ts
/**
 * Minuten-Cron: claimed pending events_inbox + faellige scheduled_jobs
 * und dispatcht an Worker-Funktionen.
 * Spec Abschn. 11+13, Orchestrator-Ruling 5.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processInbound } from '@/lib/workers/whatsapp-inbound';
import { processStatus } from '@/lib/workers/whatsapp-status';
import { processSend } from '@/lib/workers/whatsapp-send';
import { processMediaDownload } from '@/lib/workers/media-download';
import { createNotificationForAgency } from '@/lib/notifications/create';

// Retry-Backoff in Minuten
const RETRY_DELAYS = [1, 5, 15, 60];

function getRetryDelay(attempts: number): number {
  const idx = Math.min(attempts - 1, RETRY_DELAYS.length - 1);
  return RETRY_DELAYS[idx] * 60 * 1000;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET nicht konfiguriert' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = createAdminClient();
  let eventsProcessed = 0;
  let eventsFailed = 0;
  let jobsProcessed = 0;
  let jobsFailed = 0;

  // 1. events_inbox abarbeiten
  const { data: events } = await svc.rpc('claim_inbox_events', { batch_size: 100 });

  for (const event of events || []) {
    try {
      const payload = event.payload as { type: string; [key: string]: unknown };
      switch (payload.type) {
        case 'whatsapp.inbound':
          await processInbound(svc, event.agency_id, payload as Parameters<typeof processInbound>[2]);
          break;
        case 'whatsapp.status':
          await processStatus(svc, payload as Parameters<typeof processStatus>[1]);
          break;
        default:
          // Unbekannter Typ — als done markieren
          break;
      }
      await svc.from('events_inbox')
        .update({ status: 'done', processed_at: new Date().toISOString() })
        .eq('id', event.id);
      eventsProcessed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      if (event.attempts >= 5) {
        await svc.from('events_inbox')
          .update({ status: 'dead', error: errorMsg })
          .eq('id', event.id);

        // Admin-Benachrichtigung bei dead events
        if (event.agency_id) {
          await createNotificationForAgency(svc, event.agency_id, {
            title: 'Webhook-Verarbeitung fehlgeschlagen',
            body: `Event ${event.id} (${event.source}) konnte nach 5 Versuchen nicht verarbeitet werden.`,
            type: 'system',
            push_url: '/settings',
          }).catch(() => {});
        }
      } else {
        await svc.from('events_inbox')
          .update({ status: 'pending', error: errorMsg })
          .eq('id', event.id);
      }
      eventsFailed++;
    }
  }

  // 2. scheduled_jobs abarbeiten
  const { data: jobs } = await svc.rpc('claim_due_jobs', { batch_size: 100 });

  for (const job of jobs || []) {
    try {
      const payload = job.payload as { [key: string]: unknown };
      switch (job.type) {
        case 'whatsapp.send':
          await processSend(svc, payload as Parameters<typeof processSend>[1]);
          break;
        case 'media.download':
          await processMediaDownload(svc, job.agency_id, payload as Parameters<typeof processMediaDownload>[2]);
          break;
        default:
          break;
      }
      await svc.from('scheduled_jobs')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', job.id);
      jobsProcessed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      if (job.attempts >= 5) {
        await svc.from('scheduled_jobs')
          .update({ status: 'dead', last_error: errorMsg, updated_at: new Date().toISOString() })
          .eq('id', job.id);

        if (job.agency_id) {
          await createNotificationForAgency(svc, job.agency_id, {
            title: 'Geplanter Job fehlgeschlagen',
            body: `Job ${job.id} (${job.type}) ist nach 5 Versuchen gescheitert.`,
            type: 'system',
            push_url: '/settings',
          }).catch(() => {});
        }
      } else {
        // Retry mit Backoff
        const nextRun = new Date(Date.now() + getRetryDelay(job.attempts));
        await svc.from('scheduled_jobs')
          .update({
            status: 'pending',
            run_at: nextRun.toISOString(),
            last_error: errorMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      }
      jobsFailed++;
    }
  }

  return NextResponse.json({
    ok: true,
    events: { processed: eventsProcessed, failed: eventsFailed },
    jobs: { processed: jobsProcessed, failed: jobsFailed },
  });
}
```

- [ ] **Step 6: Build pruefen**

Run: `npm run build && npx vitest run`
Expected: Build gruen, alle Tests gruen.

- [ ] **Step 7: Commit**

```bash
git add src/lib/workers/ src/app/api/cron/tick/route.ts
git commit -m "feat: WhatsApp workers (inbound, status, send, media) and tick cron"
```

---

### Task 7: Vorlagen-Presets + Template-Sync-Cron

**Files:**
- Create: `src/lib/whatsapp/template-presets.ts`
- Create: `src/app/api/cron/sync-whatsapp/route.ts`

**Interfaces:**
- Consumes: `getProvider()` aus Task 3; `decryptSecret()` aus Task 2; `createAdminClient()`.
- Produces: `TEMPLATE_PRESETS: TemplatePreset[]` (10 Vorlagen-Definitionen mit vollstaendigem deutschen Body); `seedTemplatesForAccount(svc, waAccountId, agencyId): Promise<void>` (Rows anlegen + an Meta submiten); `/api/cron/sync-whatsapp` GET-Endpoint.

- [ ] **Step 1: Vorlagen-Presets definieren**

Erstelle `src/lib/whatsapp/template-presets.ts`:

```ts
/**
 * 10 Vorlagen-Presets aus Spec Abschn. 7.
 * Kategorie UTILITY, Sprache de, deutsche Bodies mit echten Umlauten.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getProvider, type TemplateDefinition } from './provider';
import { decryptSecret } from '@/lib/crypto';

export interface TemplatePreset {
  presetKey: string;
  name: string;
  category: string;
  language: string;
  body: string;
  variables: string[];
  buttons?: Array<{ type: string; text: string }>;
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    presetKey: 'application_received',
    name: 'application_received',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, danke für deine Bewerbung als {{2}} bei {{3}}. Damit wir dich schnell einordnen können, haben wir 3 bis 5 kurze Fragen an dich. Das dauert etwa 2 Minuten.',
    variables: ['vorname', 'jobtitel', 'firmenname'],
    buttons: [{ type: 'QUICK_REPLY', text: "Los geht's" }],
  },
  {
    presetKey: 'qualification_nudge',
    name: 'qualification_nudge',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, wir haben noch keine Antwort von dir erhalten. Hast du kurz Zeit für ein paar Fragen zu deiner Bewerbung als {{2}}? Dauert nur 2 Minuten.',
    variables: ['vorname', 'jobtitel'],
  },
  {
    presetKey: 'qualification_resume',
    name: 'qualification_resume',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, wir hatten neulich angefangen, ein paar Fragen zu klären. Magst du kurz weitermachen? Wir sind fast durch.',
    variables: ['vorname'],
  },
  {
    presetKey: 'appointment_invite',
    name: 'appointment_invite',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, super Profil! Wir würden dich gerne persönlich kennenlernen. Buch dir hier einen passenden Termin für ein kurzes Gespräch zur Stelle als {{2}}: {{3}}',
    variables: ['vorname', 'jobtitel', 'buchungslink'],
  },
  {
    presetKey: 'appointment_confirmation',
    name: 'appointment_confirmation',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, dein Termin ist bestätigt: {{2}} um {{3}} Uhr, {{4}}. Wir freuen uns auf dich!',
    variables: ['vorname', 'datum', 'uhrzeit', 'ort_oder_link'],
  },
  {
    presetKey: 'appointment_reminder_24h',
    name: 'appointment_reminder_24h',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, kurze Erinnerung: Morgen am {{2}} um {{3}} Uhr ist dein Vorstellungsgespräch. Bist du dabei?',
    variables: ['vorname', 'datum', 'uhrzeit'],
    buttons: [
      { type: 'QUICK_REPLY', text: 'Ich komme' },
      { type: 'QUICK_REPLY', text: 'Verschieben' },
    ],
  },
  {
    presetKey: 'appointment_reminder_2h',
    name: 'appointment_reminder_2h',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, in 2 Stunden (um {{2}} Uhr) ist dein Gespräch. Ort/Link: {{3}}. Bis gleich!',
    variables: ['vorname', 'uhrzeit', 'ort_oder_link'],
  },
  {
    presetKey: 'no_show_followup',
    name: 'no_show_followup',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, schade, dass es heute nicht geklappt hat. Kein Problem — buch dir einfach einen neuen Termin: {{2}}',
    variables: ['vorname', 'buchungslink'],
  },
  {
    presetKey: 'documents_request',
    name: 'documents_request',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, für die nächsten Schritte benötigen wir noch: {{2}}. Kannst du das bitte hier per Nachricht schicken?',
    variables: ['vorname', 'unterlage'],
  },
  {
    presetKey: 'status_update',
    name: 'status_update',
    category: 'UTILITY',
    language: 'de',
    body: 'Hallo {{1}}, ein kurzes Update zu deiner Bewerbung als {{2}}: {{3}}',
    variables: ['vorname', 'jobtitel', 'freitext'],
  },
];

/**
 * Erstellt Vorlagen-Rows in der DB und submitted sie an Meta.
 * Aufgerufen beim Verbinden einer WhatsApp-Nummer.
 */
export async function seedTemplatesForAccount(
  svc: SupabaseClient,
  waAccountId: string,
  agencyId: string
): Promise<void> {
  const { data: waAccount } = await svc
    .from('whatsapp_accounts')
    .select('waba_id, access_token_enc')
    .eq('id', waAccountId)
    .single();

  if (!waAccount) return;

  const token = decryptSecret(waAccount.access_token_enc);
  const provider = getProvider();

  for (const preset of TEMPLATE_PRESETS) {
    // Row anlegen mit status pending
    const { data: tmplRow } = await svc
      .from('whatsapp_templates')
      .insert({
        agency_id: agencyId,
        wa_account_id: waAccountId,
        name: preset.name,
        language: preset.language,
        category: preset.category,
        body: preset.body,
        variables: preset.variables,
        buttons: preset.buttons || null,
        status: 'pending',
        preset_key: preset.presetKey,
      })
      .select('id')
      .single();

    if (!tmplRow) continue;

    // An Meta submitten
    try {
      const components: Array<Record<string, unknown>> = [
        {
          type: 'BODY',
          text: preset.body,
          example: {
            body_text: [preset.variables.map((_, i) => `Beispiel${i + 1}`)],
          },
        },
      ];

      if (preset.buttons) {
        components.push({
          type: 'BUTTONS',
          buttons: preset.buttons.map(b => ({
            type: b.type,
            text: b.text,
          })),
        });
      }

      const definition: TemplateDefinition = {
        name: preset.name,
        language: preset.language,
        category: preset.category,
        components,
      };

      const { id: metaId } = await provider.createTemplate(waAccount.waba_id, token, definition);

      await svc.from('whatsapp_templates')
        .update({ meta_template_id: metaId })
        .eq('id', tmplRow.id);
    } catch {
      // Fehler beim Submit — bleibt pending, Sync-Cron holt es nach
    }
  }
}
```

- [ ] **Step 2: Sync-Cron implementieren**

Erstelle `src/app/api/cron/sync-whatsapp/route.ts`:

```ts
/**
 * Stuendlicher Cron: Vorlagen-Status und Qualitaetsbewertung synchronisieren.
 * Spec Abschn. 7: Vorlagenverwaltung, Orchestrator-Ruling 7.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/whatsapp/provider';
import { decryptSecret } from '@/lib/crypto';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET nicht konfiguriert' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = createAdminClient();
  const provider = getProvider();
  let accountsSynced = 0;
  let templatesUpdated = 0;

  // Alle verbundenen Accounts laden
  const { data: accounts } = await svc
    .from('whatsapp_accounts')
    .select('id, waba_id, phone_number_id, access_token_enc, agency_id')
    .eq('status', 'connected');

  for (const account of accounts || []) {
    try {
      const token = decryptSecret(account.access_token_enc);

      // 1. Vorlagen-Status synchronisieren
      const templates = await provider.listTemplates(account.waba_id, token);
      for (const tmpl of templates) {
        const { count } = await svc
          .from('whatsapp_templates')
          .update({
            status: tmpl.status.toLowerCase(),
            meta_template_id: tmpl.id,
            updated_at: new Date().toISOString(),
          })
          .eq('wa_account_id', account.id)
          .eq('name', tmpl.name)
          .eq('language', tmpl.language);

        if (count && count > 0) templatesUpdated++;
      }

      // 2. Qualitaetsbewertung + Messaging-Limit aktualisieren
      // (Erfordert phone_number_id Endpoint — vereinfacht ueber den bestehenden Provider)
      // In v1 reicht der Sync ueber listTemplates; Qualitaet wird via Webhook aktualisiert.

      accountsSynced++;
    } catch {
      // Silent — naechster Sync-Lauf versucht es erneut
    }
  }

  return NextResponse.json({
    ok: true,
    accountsSynced,
    templatesUpdated,
  });
}
```

- [ ] **Step 3: Build pruefen**

Run: `npm run build && npx vitest run`
Expected: Build gruen, alle Tests gruen.

- [ ] **Step 4: Commit**

```bash
git add src/lib/whatsapp/template-presets.ts src/app/api/cron/sync-whatsapp/route.ts
git commit -m "feat: WhatsApp template presets (10 German templates) and hourly sync cron"
```

---

### Task 8: Embedded Signup + Manual Connect + Settings-UI

**Files:**
- Create: `src/app/(portal)/settings/whatsapp/page.tsx`
- Create: `src/app/api/whatsapp/embedded-signup/callback/route.ts`
- Create: `src/app/api/whatsapp/manual-connect/route.ts`
- Modify: `src/components/app-sidebar.tsx`

**Interfaces:**
- Consumes: `getProvider()` aus Task 3; `encryptSecret()` aus Task 2; `seedTemplatesForAccount()` aus Task 7; `getCurrentUser()`, `getEffectiveAgencyId()` aus `src/lib/auth`; `canWriteRole()` aus `src/lib/recruiting/scope`.
- Produces: WhatsApp-Settings-Seite mit FB JS SDK Embedded Signup; Callback-Endpoint fuer Code-Exchange; Manual-Connect-Endpoint fuer Platform-Admins; Sidebar-Nav-Link auf `/settings/whatsapp`.

- [ ] **Step 1: Embedded-Signup Callback-Route**

Erstelle `src/app/api/whatsapp/embedded-signup/callback/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/whatsapp/provider';
import { encryptSecret } from '@/lib/crypto';
import { seedTemplatesForAccount } from '@/lib/whatsapp/template-presets';
import { z } from 'zod';

const CallbackSchema = z.object({
  code: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }
  if (!canWriteRole(user.role)) {
    return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });
  }

  // Org Admin oder Platform Admin
  if (user.role !== 'agency_owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Nur Org-Admins können WhatsApp verbinden' }, { status: 403 });
  }

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CallbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validierungsfehler' }, { status: 400 });
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json({ error: 'Meta App nicht konfiguriert' }, { status: 500 });
  }

  try {
    const provider = getProvider();

    // 1. Code gegen Token tauschen
    const { accessToken, wabaId, phoneNumberId } = await provider.exchangeCode(
      parsed.data.code, appId, appSecret
    );

    // 2. Verschluesselt speichern
    const tokenEnc = encryptSecret(accessToken);
    const svc = createAdminClient();

    const { data: waAccount, error: insertErr } = await svc
      .from('whatsapp_accounts')
      .upsert({
        agency_id: agencyId,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        access_token_enc: tokenEnc,
        provider: 'cloud_api',
        status: 'connected',
        connected_at: new Date().toISOString(),
      }, { onConflict: 'phone_number_id' })
      .select('id')
      .single();

    if (insertErr || !waAccount) {
      return NextResponse.json({ error: 'WhatsApp-Konto konnte nicht gespeichert werden' }, { status: 500 });
    }

    // 3. Nummer registrieren
    await provider.registerPhone(phoneNumberId, accessToken).catch(() => {});

    // 4. Webhook abonnieren
    await provider.subscribeWebhook(wabaId, accessToken).catch(() => {});

    // 5. Vorlagen seeden + submitten
    await seedTemplatesForAccount(svc, waAccount.id, agencyId);

    // 6. Audit-Log
    await svc.from('audit_log').insert({
      actor_id: user.id,
      agency_id: agencyId,
      action: 'whatsapp.connected',
      target: waAccount.id,
      data: { waba_id: wabaId, phone_number_id: phoneNumberId, method: 'embedded_signup' },
    });

    return NextResponse.json({ ok: true, accountId: waAccount.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manual-Connect-Route (Platform-Admin)**

Erstelle `src/app/api/whatsapp/manual-connect/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/whatsapp/provider';
import { encryptSecret } from '@/lib/crypto';
import { seedTemplatesForAccount } from '@/lib/whatsapp/template-presets';
import { z } from 'zod';

const ManualSchema = z.object({
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  // Nur Platform-Admins
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Nur Platform-Admins können manuell verbinden' }, { status: 403 });
  }

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: 'Keine Agentur — bitte zuerst impersonieren' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = ManualSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validierungsfehler: wabaId, phoneNumberId und accessToken erforderlich' }, { status: 400 });
  }

  try {
    const svc = createAdminClient();
    const tokenEnc = encryptSecret(parsed.data.accessToken);
    const provider = getProvider();

    const { data: waAccount, error: insertErr } = await svc
      .from('whatsapp_accounts')
      .upsert({
        agency_id: agencyId,
        waba_id: parsed.data.wabaId,
        phone_number_id: parsed.data.phoneNumberId,
        access_token_enc: tokenEnc,
        provider: 'cloud_api',
        status: 'connected',
        connected_at: new Date().toISOString(),
      }, { onConflict: 'phone_number_id' })
      .select('id')
      .single();

    if (insertErr || !waAccount) {
      return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
    }

    // Nummer registrieren + Webhook abonnieren
    await provider.registerPhone(parsed.data.phoneNumberId, parsed.data.accessToken).catch(() => {});
    await provider.subscribeWebhook(parsed.data.wabaId, parsed.data.accessToken).catch(() => {});

    // Vorlagen seeden
    await seedTemplatesForAccount(svc, waAccount.id, agencyId);

    // Audit-Log
    await svc.from('audit_log').insert({
      actor_id: user.id,
      agency_id: agencyId,
      action: 'whatsapp.connected',
      target: waAccount.id,
      data: { waba_id: parsed.data.wabaId, phone_number_id: parsed.data.phoneNumberId, method: 'manual' },
    });

    return NextResponse.json({ ok: true, accountId: waAccount.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 3: WhatsApp-Settings-Seite**

Erstelle `src/app/(portal)/settings/whatsapp/page.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Phone, CheckCircle, AlertCircle, Loader2, Shield } from 'lucide-react';

interface WaAccount {
  id: string;
  waba_id: string;
  phone_number_id: string;
  display_number: string | null;
  status: string;
  quality_rating: string | null;
  messaging_limit: string | null;
  connected_at: string;
}

interface WaTemplate {
  id: string;
  name: string;
  status: string;
  preset_key: string | null;
}

export default function WhatsAppSettingsPage() {
  const [account, setAccount] = useState<WaAccount | null>(null);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');

  // Manual connect form (admin only)
  const [manualWaba, setManualWaba] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [manualSaving, setManualSaving] = useState(false);

  const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '';
  const META_ES_CONFIG_ID = process.env.NEXT_PUBLIC_META_ES_CONFIG_ID || '';
  const envConfigured = META_APP_ID !== '' && META_ES_CONFIG_ID !== '';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await fetch('/api/auth/me');
      const me = meRes.ok ? await meRes.json() : null;
      setUserRole(me?.role || '');

      const [accRes, tmplRes] = await Promise.all([
        fetch('/api/whatsapp/account').then(r => r.ok ? r.json() : null),
        fetch('/api/whatsapp/templates').then(r => r.ok ? r.json() : []),
      ]);
      setAccount(accRes);
      if (Array.isArray(tmplRes)) setTemplates(tmplRes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Embedded Signup Callback
  useEffect(() => {
    if (!envConfigured) return;

    function handleMessage(event: MessageEvent) {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP' && data.data?.code) {
          fetch('/api/whatsapp/embedded-signup/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: data.data.code }),
          })
            .then(r => r.json())
            .then(result => {
              if (result.ok) {
                toast.success('WhatsApp erfolgreich verbunden!');
                loadData();
              } else {
                toast.error(result.error || 'Verbindung fehlgeschlagen');
              }
            })
            .catch(() => toast.error('Verbindung fehlgeschlagen'));
        }
      } catch { /* ignore non-JSON messages */ }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [envConfigured, loadData]);

  function launchEmbeddedSignup() {
    // FB JS SDK muss geladen sein
    const FB = (window as unknown as { FB?: { login: (cb: (res: { authResponse?: { code?: string } }) => void, opts: Record<string, unknown>) => void } }).FB;
    if (!FB) {
      toast.error('Facebook SDK konnte nicht geladen werden');
      return;
    }
    FB.login(
      (response) => {
        if (response.authResponse?.code) {
          fetch('/api/whatsapp/embedded-signup/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: response.authResponse.code }),
          })
            .then(r => r.json())
            .then(result => {
              if (result.ok) {
                toast.success('WhatsApp erfolgreich verbunden!');
                loadData();
              } else {
                toast.error(result.error || 'Verbindung fehlgeschlagen');
              }
            })
            .catch(() => toast.error('Verbindung fehlgeschlagen'));
        }
      },
      {
        config_id: META_ES_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: '',
          sessionInfoVersion: '3',
        },
      }
    );
  }

  async function handleManualConnect() {
    if (!manualWaba || !manualPhone || !manualToken) {
      toast.error('Alle Felder sind erforderlich');
      return;
    }
    setManualSaving(true);
    try {
      const res = await fetch('/api/whatsapp/manual-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wabaId: manualWaba,
          phoneNumberId: manualPhone,
          accessToken: manualToken,
        }),
      });
      const result = await res.json();
      if (result.ok) {
        toast.success('WhatsApp manuell verbunden!');
        setManualWaba('');
        setManualPhone('');
        setManualToken('');
        loadData();
      } else {
        toast.error(result.error || 'Verbindung fehlgeschlagen');
      }
    } finally {
      setManualSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageHeader label="EINSTELLUNGEN" title="WhatsApp" />

      {/* FB JS SDK Script */}
      {envConfigured && (
        <script
          async
          defer
          crossOrigin="anonymous"
          src={`https://connect.facebook.net/de_DE/sdk.js#xfbml=true&version=v23.0&appId=${META_APP_ID}`}
        />
      )}

      {/* Status */}
      {account ? (
        <Card padding="md" className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">WhatsApp verbunden</h2>
              <p className="text-sm text-gray-400">{account.display_number || account.phone_number_id}</p>
            </div>
          </div>
          <div className="space-y-3 pl-12">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 w-28">Status</span>
              <Badge variant={account.status === 'connected' ? 'green' : 'red'}>
                {account.status === 'connected' ? 'Verbunden' : 'Getrennt'}
              </Badge>
            </div>
            {account.quality_rating && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-28">Qualität</span>
                <span className="text-sm font-medium text-gray-900">{account.quality_rating}</span>
              </div>
            )}
            {account.messaging_limit && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-28">Limit</span>
                <span className="text-sm font-medium text-gray-900">{account.messaging_limit}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 w-28">Verbunden seit</span>
              <span className="text-sm text-gray-900">{new Date(account.connected_at).toLocaleDateString('de-DE')}</span>
            </div>
          </div>
        </Card>
      ) : (
        <Card padding="md" className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
              <Phone className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">WhatsApp nicht verbunden</h2>
              <p className="text-sm text-gray-400">Verbinde deine Nummer, um Bewerber per WhatsApp zu kontaktieren.</p>
            </div>
          </div>
          {envConfigured ? (
            <div className="pl-12">
              <Button onClick={launchEmbeddedSignup} size="md">
                <Phone className="w-4 h-4" />
                WhatsApp verbinden
              </Button>
            </div>
          ) : (
            <div className="pl-12">
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Noch nicht konfiguriert — Meta-App-ID und Embedded-Signup-Config fehlen in den Umgebungsvariablen.</span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Vorlagen-Status */}
      {templates.length > 0 && (
        <Card padding="md" className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Vorlagen-Status</h2>
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                <span className="text-sm text-gray-900">{t.name}</span>
                <Badge variant={t.status === 'approved' ? 'green' : t.status === 'rejected' ? 'red' : 'gray'}>
                  {t.status === 'approved' ? 'Freigegeben' : t.status === 'rejected' ? 'Abgelehnt' : t.status === 'paused' ? 'Pausiert' : 'Ausstehend'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Manual Connect — nur Platform-Admin */}
      {userRole === 'admin' && (
        <Card padding="md" className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Manuell verbinden (Admin)</h2>
              <p className="text-sm text-gray-400">Für Tests vor Meta-App-Freigabe</p>
            </div>
          </div>
          <div className="space-y-3 pl-12">
            <Input
              placeholder="WABA ID"
              value={manualWaba}
              onChange={e => setManualWaba(e.target.value)}
            />
            <Input
              placeholder="Phone Number ID"
              value={manualPhone}
              onChange={e => setManualPhone(e.target.value)}
            />
            <Input
              placeholder="Access Token"
              type="password"
              value={manualToken}
              onChange={e => setManualToken(e.target.value)}
            />
            <Button onClick={handleManualConnect} disabled={manualSaving} size="md" variant="secondary">
              {manualSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {manualSaving ? 'Wird verbunden...' : 'Manuell verbinden'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 4: API-Endpunkte fuer Account- und Templates-Abfrage (von der Settings-Seite genutzt)**

Da die Settings-Seite `fetch('/api/whatsapp/account')` und `fetch('/api/whatsapp/templates')` aufruft, erstelle diese kurzen Routen:

Erstelle `src/app/api/whatsapp/account/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json(null);

  const svc = createAdminClient();
  const { data } = await svc
    .from('whatsapp_accounts')
    .select('id, waba_id, phone_number_id, display_number, status, quality_rating, messaging_limit, connected_at')
    .eq('agency_id', agencyId)
    .eq('status', 'connected')
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json(data);
}
```

Erstelle `src/app/api/whatsapp/templates/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json([]);

  const svc = createAdminClient();
  const { data } = await svc
    .from('whatsapp_templates')
    .select('id, name, status, preset_key')
    .eq('agency_id', agencyId)
    .order('name');

  return NextResponse.json(data || []);
}
```

- [ ] **Step 5: Sidebar aktualisieren**

In `src/components/app-sidebar.tsx`, fuege den WhatsApp-Link zur `agencyGroups` hinzu und den Inbox-Link:

Importiere `MessageSquare` und `Smartphone` von lucide-react:

```ts
import {
  // ... bestehende Imports ...
  MessageSquare,
  Smartphone,
} from 'lucide-react';
```

Aendere `agencyGroups`:

```ts
const agencyGroups: SidebarGroup[] = [
  {
    label: 'Recruiting',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, href: '/dashboard' },
      { id: 'inbox', label: 'Inbox', icon: <MessageSquare className="w-5 h-5" />, href: '/inbox' },
      { id: 'jobs', label: 'Stellenanzeigen', icon: <Briefcase className="w-5 h-5" />, href: '/jobs' },
      { id: 'candidates', label: 'Bewerber', icon: <ClipboardList className="w-5 h-5" />, href: '/candidates' },
      { id: 'reports', label: 'Reports', icon: <BarChart3 className="w-5 h-5" />, href: '/reports' },
    ],
  },
  {
    label: 'Zusammenarbeit',
    items: [
      { id: 'status', label: 'Projektstatus', icon: <ListChecks className="w-5 h-5" />, href: '/status' },
      { id: 'masterclass', label: 'Masterclass', icon: <GraduationCap className="w-5 h-5" />, href: '/masterclass' },
    ],
  },
];
```

- [ ] **Step 6: Build pruefen**

Run: `npm run build && npx vitest run`
Expected: Build gruen, alle Tests gruen.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/whatsapp/ src/app/\(portal\)/settings/whatsapp/ src/components/app-sidebar.tsx
git commit -m "feat: WhatsApp Embedded Signup, manual connect, settings page, sidebar nav"
```

---

### Task 9: Quick Replies API + Sende-API

**Files:**
- Create: `src/app/api/quick-replies/route.ts`
- Create: `src/app/api/whatsapp/send/route.ts`

**Interfaces:**
- Consumes: `getCurrentUser()`, `getEffectiveAgencyId()`, `canWriteRole()`, `createAdminClient()`, `sendWhatsAppMessage()` aus Task 5.
- Produces: `/api/quick-replies` GET/POST/DELETE; `/api/whatsapp/send` POST.

- [ ] **Step 1: Quick-Replies-Route**

Erstelle `src/app/api/quick-replies/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const CreateSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(2000),
  shortcut: z.string().max(20).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json([]);

  const svc = createAdminClient();
  const { data } = await svc
    .from('quick_replies')
    .select('id, title, body, shortcut')
    .eq('agency_id', agencyId)
    .order('title');

  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validierungsfehler' }, { status: 400 });

  const svc = createAdminClient();
  const { data, error } = await svc
    .from('quick_replies')
    .insert({ agency_id: agencyId, ...parsed.data })
    .select('id, title, body, shortcut')
    .single();

  if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'ID erforderlich' }, { status: 400 });

  const svc = createAdminClient();
  await svc.from('quick_replies').delete().eq('id', id).eq('agency_id', agencyId);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Sende-API (aus Inbox heraus)**

Erstelle `src/app/api/whatsapp/send/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { z } from 'zod';

const SendSchema = z.object({
  conversationId: z.string().uuid(),
  type: z.enum(['text', 'template', 'image', 'document']),
  body: z.string().optional(),
  templateId: z.string().uuid().optional(),
  templateVariables: z.record(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const rawBody = await request.json();
  const parsed = SendSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: 'Validierungsfehler' }, { status: 400 });

  const svc = createAdminClient();

  // Conversation laden (mit Tenant-Pruefung)
  const { data: conv } = await svc
    .from('conversations')
    .select('id, candidate_id, wa_account_id, state')
    .eq('id', parsed.data.conversationId)
    .eq('agency_id', agencyId)
    .single();

  if (!conv) return NextResponse.json({ error: 'Konversation nicht gefunden' }, { status: 404 });

  // Candidate-Phone laden
  const { data: candidate } = await svc
    .from('candidates')
    .select('phone_e164')
    .eq('id', conv.candidate_id)
    .single();

  if (!candidate?.phone_e164) {
    return NextResponse.json({ error: 'Telefonnummer nicht vorhanden' }, { status: 400 });
  }

  // Payload bauen
  let payload: import('@/lib/whatsapp/provider').SendMessagePayload;
  if (parsed.data.type === 'template' && parsed.data.templateId) {
    // Template laden
    const { data: tmpl } = await svc
      .from('whatsapp_templates')
      .select('name, language')
      .eq('id', parsed.data.templateId)
      .single();

    if (!tmpl) return NextResponse.json({ error: 'Vorlage nicht gefunden' }, { status: 404 });

    const vars = parsed.data.templateVariables || {};
    const components = Object.keys(vars).length > 0 ? [{
      type: 'body',
      parameters: Object.values(vars).map(v => ({ type: 'text', text: v })),
    }] : [];

    payload = {
      to: candidate.phone_e164,
      type: 'template',
      template: {
        name: tmpl.name,
        language: { code: tmpl.language },
        components,
      },
    };
  } else {
    payload = {
      to: candidate.phone_e164,
      type: 'text',
      text: { body: parsed.data.body || '' },
    };
  }

  // Recruiter-Freitext-Nachricht setzt automatisch human_active
  if (parsed.data.type === 'text' && conv.state !== 'human_active') {
    await svc.from('conversations')
      .update({ state: 'human_active', updated_at: new Date().toISOString() })
      .eq('id', conv.id);
  }

  const result = await sendWhatsAppMessage(svc, {
    agencyId,
    conversationId: conv.id,
    candidatePhone: candidate.phone_e164,
    waAccountId: conv.wa_account_id,
    payload,
    senderType: 'user',
    userId: user.id,
    templateId: parsed.data.templateId || null,
    isHumanUiSend: true,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, messageId: result.messageId });
}
```

- [ ] **Step 3: Build pruefen**

Run: `npm run build && npx vitest run`
Expected: Build gruen, alle Tests gruen.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/quick-replies/route.ts src/app/api/whatsapp/send/route.ts
git commit -m "feat: Quick Replies CRUD API and WhatsApp send API for inbox"
```

---

### Task 10: TypeScript-Typen + NotificationType

**Files:**
- Modify: `src/lib/types/database.ts`
- Modify: `src/lib/notifications/create.ts`

**Interfaces:**
- Consumes: bestehende Typen in `src/lib/types/database.ts`.
- Produces: `WhatsAppAccount`, `WhatsAppTemplate`, `Conversation`, `Message`, `QuickReply` Typen; erweiterter `NotificationType` mit `'whatsapp_inbound'`.

- [ ] **Step 1: Typen in database.ts hinzufuegen**

Am Ende von `src/lib/types/database.ts` anfuegen:

```ts
// Phase 2: WhatsApp + Inbox

export type WhatsAppAccount = {
  id: string;
  agency_id: string;
  waba_id: string;
  phone_number_id: string;
  display_number: string | null;
  access_token_enc: string;
  provider: string;
  quality_rating: string | null;
  messaging_limit: string | null;
  status: 'connected' | 'disconnected' | 'banned';
  connected_at: string;
  created_at: string;
  updated_at: string;
};

export type WhatsAppTemplate = {
  id: string;
  agency_id: string;
  wa_account_id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  variables: string[];
  buttons: Array<{ type: string; text: string }> | null;
  meta_template_id: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'paused' | 'deleted';
  preset_key: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationState = 'bot_active' | 'human_active' | 'waiting' | 'closed';

export type Conversation = {
  id: string;
  agency_id: string;
  candidate_id: string;
  wa_account_id: string;
  application_id: string | null;
  state: ConversationState;
  bot_step: number;
  window_expires_at: string | null;
  unread_count: number;
  last_message_at: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageDirection = 'in' | 'out';
export type MessageSenderType = 'candidate' | 'bot' | 'user' | 'system';
export type MessageType = 'text' | 'template' | 'image' | 'document' | 'audio' | 'interactive';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export type Message = {
  id: string;
  agency_id: string;
  conversation_id: string;
  direction: MessageDirection;
  sender_type: MessageSenderType;
  user_id: string | null;
  type: MessageType;
  body: string | null;
  media_path: string | null;
  wa_message_id: string | null;
  status: MessageStatus;
  error_code: string | null;
  template_id: string | null;
  cost_category: string | null;
  created_at: string;
};

export type QuickReply = {
  id: string;
  agency_id: string;
  title: string;
  body: string;
  shortcut: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 2: NotificationType erweitern**

In `src/lib/notifications/create.ts`, erweitere den Typ:

```ts
export type NotificationType =
  | 'new_candidate'
  | 'stage_change'
  | 'call_result'
  | 'task_assigned'
  | 'task_due'
  | 'sla_breach'
  | 'noshow'
  | 'opt_out'
  | 'system'
  | 'whatsapp_inbound';
```

- [ ] **Step 3: Build pruefen**

Run: `npm run build && npx vitest run`
Expected: Build gruen, alle Tests gruen.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/database.ts src/lib/notifications/create.ts
git commit -m "feat: WhatsApp/Inbox TypeScript types and whatsapp_inbound notification type"
```

---

### Task 11: Inbox-UI (Gespraechsliste + Chat-Pane + Sidebar)

**Files:**
- Create: `src/app/(portal)/inbox/page.tsx`
- Create: `src/components/inbox/conversation-list.tsx`
- Create: `src/components/inbox/chat-pane.tsx`
- Create: `src/components/inbox/candidate-sidebar.tsx`
- Create: `src/components/inbox/template-picker.tsx`
- Create: `src/components/inbox/quick-reply-modal.tsx`
- Create: `src/app/api/conversations/route.ts`
- Create: `src/app/api/conversations/[id]/messages/route.ts`

**Interfaces:**
- Consumes: `getCurrentUser()`, `getEffectiveAgencyId()`, `createAdminClient()`; Supabase Realtime; Typen aus Task 10; `/api/whatsapp/send` aus Task 9; `/api/quick-replies` aus Task 9; `/api/whatsapp/templates` aus Task 8; UI-Komponenten `Card`, `Button`, `Input`, `Badge`, `PageHeader`, `Modal` aus `src/components/ui/`.
- Produces: `/inbox` Seite mit drei Spalten; Realtime-Updates <2s; Filter, Suche, Read-Marking, Assign, Template-Picker, Quick-Reply-Auswahl.

Dieses Task enthalt umfangreiche UI-Arbeit. Detaillierte Schritte:

- [ ] **Step 1: Conversations-API**

Erstelle `src/app/api/conversations/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json([]);

  const filter = request.nextUrl.searchParams.get('filter') || 'all';
  const search = request.nextUrl.searchParams.get('search') || '';

  const svc = createAdminClient();
  let query = svc
    .from('conversations')
    .select(`
      id, state, window_expires_at, unread_count, last_message_at, assigned_to,
      candidate:candidates!inner(id, name, phone_e164, email),
      application:applications(id, job:jobs(title), stage:pipeline_stages(name, color))
    `)
    .eq('agency_id', agencyId)
    .order('last_message_at', { ascending: false });

  // Filter
  switch (filter) {
    case 'mine':
      query = query.eq('assigned_to', user.id);
      break;
    case 'unassigned':
      query = query.is('assigned_to', null);
      break;
    case 'unread':
      query = query.gt('unread_count', 0);
      break;
    case 'expiring': {
      const twoHours = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      query = query.lt('window_expires_at', twoHours).gt('window_expires_at', new Date().toISOString());
      break;
    }
  }

  // Suche
  if (search) {
    query = query.or(`candidate.name.ilike.%${search}%,candidate.phone_e164.ilike.%${search}%`);
  }

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data || []);
}
```

Erstelle `src/app/api/conversations/[id]/messages/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json([]);

  const svc = createAdminClient();

  // Conversation muss zur Agency gehoeren
  const { data: conv } = await svc
    .from('conversations')
    .select('id')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single();

  if (!conv) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  // Messages laden
  const { data: messages } = await svc
    .from('messages')
    .select('id, direction, sender_type, user_id, type, body, media_path, wa_message_id, status, error_code, template_id, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  // unread_count nullen
  await svc.from('conversations')
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json(messages || []);
}
```

- [ ] **Step 2: Inbox-Seite und Komponenten**

Erstelle `src/app/(portal)/inbox/page.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ConversationList } from '@/components/inbox/conversation-list';
import { ChatPane } from '@/components/inbox/chat-pane';
import { CandidateSidebar } from '@/components/inbox/candidate-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/client';

export default function InboxPage() {
  const [conversations, setConversations] = useState<Record<string, unknown>[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams({ filter });
    if (search) params.set('search', search);
    const res = await fetch(`/api/conversations?${params}`);
    if (res.ok) {
      const data = await res.json();
      setConversations(data);
    }
    setLoading(false);
  }, [filter, search]);

  const loadMessages = useCallback(async (convId: string) => {
    const res = await fetch(`/api/conversations/${convId}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  // Supabase Realtime fuer Live-Updates
  useEffect(() => {
    const channel = supabase
      .channel('inbox-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const newMsg = payload.new as Record<string, unknown>;
        // Update messages if current conversation
        if (selectedId && newMsg.conversation_id === selectedId) {
          setMessages(prev => [...prev, newMsg]);
        }
        // Refresh conversation list
        loadConversations();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
      }, () => {
        loadConversations();
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [supabase, selectedId, loadConversations]);

  const selectedConv = conversations.find((c) => (c as { id: string }).id === selectedId) || null;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <PageHeader label="KOMMUNIKATION" title="Inbox" />

      <div className="flex flex-1 min-h-0 border-t border-gray-200">
        {/* Linke Spalte: Gespraechsliste */}
        <div className="w-80 border-r border-gray-200 flex-shrink-0 overflow-y-auto">
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            loading={loading}
          />
        </div>

        {/* Mitte: Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedId ? (
            <ChatPane
              conversationId={selectedId}
              messages={messages}
              conversation={selectedConv}
              onMessageSent={() => {
                loadMessages(selectedId);
                loadConversations();
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Wähle eine Konversation aus
            </div>
          )}
        </div>

        {/* Rechte Spalte: Bewerber-Sidebar */}
        {selectedConv && (
          <div className="w-80 border-l border-gray-200 flex-shrink-0 overflow-y-auto">
            <CandidateSidebar conversation={selectedConv} />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: ConversationList-Komponente**

Erstelle `src/components/inbox/conversation-list.tsx`:

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Clock } from 'lucide-react';

interface Props {
  conversations: Record<string, unknown>[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: string;
  onFilterChange: (f: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  loading: boolean;
}

const FILTERS = [
  { value: 'all', label: 'Alle' },
  { value: 'mine', label: 'Mir zugewiesen' },
  { value: 'unassigned', label: 'Nicht zugewiesen' },
  { value: 'unread', label: 'Ungelesen' },
  { value: 'expiring', label: 'Fenster läuft ab' },
];

function formatTime(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function windowCountdown(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return null;
  const hours = Math.floor(remaining / 3600_000);
  const mins = Math.floor((remaining % 3600_000) / 60_000);
  return `${hours}h ${mins}m`;
}

const STATE_LABELS: Record<string, { label: string; variant: 'green' | 'blue' | 'gray' | 'red' }> = {
  bot_active: { label: 'Bot', variant: 'blue' },
  human_active: { label: 'Mensch', variant: 'green' },
  waiting: { label: 'Wartet', variant: 'gray' },
  closed: { label: 'Geschlossen', variant: 'red' },
};

export function ConversationList({ conversations, selectedId, onSelect, filter, onFilterChange, search, onSearchChange, loading }: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Suche */}
      <div className="p-3 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Name oder Telefon suchen..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-gray-200">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f.value
                ? 'bg-red-50 text-red-600'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Keine Konversationen</div>
        ) : (
          conversations.map(conv => {
            const c = conv as {
              id: string;
              state: string;
              window_expires_at: string | null;
              unread_count: number;
              last_message_at: string | null;
              assigned_to: string | null;
              candidate: { id: string; name: string; phone_e164: string | null };
              application: Array<{ job: { title: string } | null }> | null;
            };
            const stateInfo = STATE_LABELS[c.state] || STATE_LABELS.waiting;
            const countdown = windowCountdown(c.window_expires_at);
            const jobTitle = c.application?.[0]?.job?.title || '';

            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  selectedId === c.id ? 'bg-red-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{c.candidate?.name}</span>
                      {c.unread_count > 0 && (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                    {jobTitle && (
                      <span className="text-xs text-gray-400 block truncate">{jobTitle}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-gray-400">{formatTime(c.last_message_at)}</span>
                    <Badge variant={stateInfo.variant}>{stateInfo.label}</Badge>
                  </div>
                </div>
                {countdown && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                    <Clock className="w-3 h-3" />
                    <span>{countdown}</span>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: ChatPane-Komponente**

Erstelle `src/components/inbox/chat-pane.tsx`:

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TemplatePicker } from './template-picker';
import { QuickReplyModal } from './quick-reply-modal';
import { Send, Bot, User, Monitor, CheckCheck, Check, X, Slash } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  conversationId: string;
  messages: Record<string, unknown>[];
  conversation: Record<string, unknown> | null;
  onMessageSent: () => void;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  queued: <span className="text-gray-300">&#x25cf;</span>,
  sent: <Check className="w-3 h-3 text-gray-400" />,
  delivered: <CheckCheck className="w-3 h-3 text-gray-400" />,
  read: <CheckCheck className="w-3 h-3 text-blue-500" />,
  failed: <X className="w-3 h-3 text-red-500" />,
};

const SENDER_ICONS: Record<string, React.ReactNode> = {
  candidate: <User className="w-3.5 h-3.5" />,
  bot: <Bot className="w-3.5 h-3.5" />,
  user: <User className="w-3.5 h-3.5" />,
  system: <Monitor className="w-3.5 h-3.5" />,
};

export function ChatPane({ conversationId, messages, conversation, onMessageSent }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conv = conversation as { state: string; window_expires_at: string | null; candidate: { name: string } } | null;
  const windowOpen = conv?.window_expires_at ? new Date(conv.window_expires_at).getTime() > Date.now() : false;
  const isClosed = !windowOpen;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          type: 'text',
          body: text.trim(),
        }),
      });
      const result = await res.json();
      if (result.ok) {
        setText('');
        onMessageSent();
      } else {
        toast.error(result.error || 'Senden fehlgeschlagen');
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === '/' && text === '') {
      e.preventDefault();
      setShowQuickReplies(true);
    }
  }

  async function handleTemplateSend(templateId: string, variables: Record<string, string>) {
    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          type: 'template',
          templateId,
          templateVariables: variables,
        }),
      });
      const result = await res.json();
      if (result.ok) {
        onMessageSent();
        toast.success('Vorlage gesendet');
      } else {
        toast.error(result.error || 'Senden fehlgeschlagen');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">{conv?.candidate?.name || 'Chat'}</h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(m => {
          const msg = m as {
            id: string;
            direction: string;
            sender_type: string;
            body: string | null;
            status: string;
            error_code: string | null;
            created_at: string;
          };
          const isOut = msg.direction === 'out';

          return (
            <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                isOut
                  ? msg.sender_type === 'bot'
                    ? 'bg-blue-50 text-blue-900'
                    : msg.sender_type === 'system'
                    ? 'bg-gray-100 text-gray-600 text-xs italic'
                    : 'bg-red-50 text-gray-900'
                  : 'bg-gray-100 text-gray-900'
              }`}>
                {/* Sender badge */}
                <div className="flex items-center gap-1 mb-0.5">
                  <span className={isOut ? 'text-gray-400' : 'text-gray-500'}>
                    {SENDER_ICONS[msg.sender_type]}
                  </span>
                  <span className="text-xs text-gray-400">
                    {msg.sender_type === 'bot' ? 'Bot' : msg.sender_type === 'system' ? 'System' : msg.sender_type === 'candidate' ? '' : 'Recruiter'}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-xs text-gray-400">
                    {new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isOut && STATUS_ICONS[msg.status]}
                </div>
                {msg.status === 'failed' && msg.error_code && (
                  <p className="text-xs text-red-500 mt-1">{msg.error_code}</p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 p-3">
        {isClosed ? (
          <TemplatePicker onSend={handleTemplateSend} sending={sending} />
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                placeholder="Nachricht schreiben... (/ für Textbausteine)"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
              />
            </div>
            <Button onClick={handleSend} disabled={sending || !text.trim()} size="md">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Quick Reply Modal */}
      {showQuickReplies && (
        <QuickReplyModal
          onSelect={(body) => {
            setText(body);
            setShowQuickReplies(false);
          }}
          onClose={() => setShowQuickReplies(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: CandidateSidebar, TemplatePicker, QuickReplyModal**

Erstelle `src/components/inbox/candidate-sidebar.tsx`:

```tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { Phone, Mail, Briefcase, User } from 'lucide-react';
import Link from 'next/link';

interface Props {
  conversation: Record<string, unknown>;
}

export function CandidateSidebar({ conversation }: Props) {
  const conv = conversation as {
    candidate: { id: string; name: string; phone_e164: string | null; email: string | null };
    application: Array<{
      id: string;
      job: { title: string } | null;
      stage: { name: string; color: string } | null;
    }> | null;
    state: string;
    assigned_to: string | null;
  };

  const candidate = conv.candidate;
  const app = conv.application?.[0];

  return (
    <div className="p-4 space-y-6">
      {/* Name + Link */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
          <User className="w-5 h-5 text-gray-400" />
        </div>
        <div>
          <Link href={`/candidates/${candidate.id}`} className="text-sm font-semibold text-gray-900 hover:underline">
            {candidate.name}
          </Link>
        </div>
      </div>

      {/* Kontakt */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase">Kontakt</h4>
        {candidate.phone_e164 && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Phone className="w-4 h-4 text-gray-400" />
            <span>{candidate.phone_e164}</span>
          </div>
        )}
        {candidate.email && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Mail className="w-4 h-4 text-gray-400" />
            <span>{candidate.email}</span>
          </div>
        )}
      </div>

      {/* Job + Stufe */}
      {app && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase">Bewerbung</h4>
          {app.job && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Briefcase className="w-4 h-4 text-gray-400" />
              <span>{app.job.title}</span>
            </div>
          )}
          {app.stage && (
            <Badge variant="gray">{app.stage.name}</Badge>
          )}
        </div>
      )}
    </div>
  );
}
```

Erstelle `src/components/inbox/template-picker.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';

interface Props {
  onSend: (templateId: string, variables: Record<string, string>) => void;
  sending: boolean;
}

interface Template {
  id: string;
  name: string;
  body: string;
  variables: string[];
  status: string;
}

export function TemplatePicker({ onSend, sending }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/whatsapp/templates?status=approved')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setTemplates(data.filter((t: Template) => t.status === 'approved'));
      });
  }, []);

  const selected = templates.find(t => t.id === selectedId);

  function handleVariableChange(key: string, value: string) {
    setVariables(prev => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">24h-Fenster geschlossen — nur Vorlagen erlaubt</p>
      <div className="flex flex-wrap gap-1.5">
        {templates.map(t => (
          <button
            key={t.id}
            onClick={() => {
              setSelectedId(t.id);
              setVariables({});
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedId === t.id ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.name.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      {selected && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.body}</p>
          {selected.variables?.length > 0 && (
            <div className="space-y-1.5">
              {selected.variables.map((v: string, i: number) => (
                <Input
                  key={v}
                  placeholder={`{{${i + 1}}} ${v}`}
                  value={variables[String(i + 1)] || ''}
                  onChange={e => handleVariableChange(String(i + 1), e.target.value)}
                  className="text-sm"
                />
              ))}
            </div>
          )}
          <Button
            onClick={() => selectedId && onSend(selectedId, variables)}
            disabled={sending}
            size="sm"
          >
            <Send className="w-3.5 h-3.5" />
            Vorlage senden
          </Button>
        </div>
      )}
    </div>
  );
}
```

Erstelle `src/components/inbox/quick-reply-modal.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';

interface QuickReply {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
}

interface Props {
  onSelect: (body: string) => void;
  onClose: () => void;
}

export function QuickReplyModal({ onSelect, onClose }: Props) {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/quick-replies')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setReplies(data); });
  }, []);

  const filtered = replies.filter(r =>
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    (r.shortcut && r.shortcut.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Modal open onClose={onClose} title="Textbaustein wählen">
      <div className="space-y-3">
        <input
          autoFocus
          placeholder="Suchen..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        <div className="max-h-60 overflow-y-auto space-y-1">
          {filtered.map(r => (
            <button
              key={r.id}
              onClick={() => onSelect(r.body)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900">{r.title}</span>
              {r.shortcut && <span className="text-xs text-gray-400 ml-2">/{r.shortcut}</span>}
              <p className="text-xs text-gray-500 truncate mt-0.5">{r.body}</p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Keine Textbausteine gefunden</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 6: Build pruefen**

Run: `npm run build && npx vitest run`
Expected: Build gruen, alle Tests gruen.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(portal\)/inbox/ src/components/inbox/ src/app/api/conversations/
git commit -m "feat: Chat Inbox UI with conversation list, chat pane, candidate sidebar, realtime"
```

---

### Task 12: Cron-Config (vercel.json) + Abnahme

**Files:**
- Modify: `vercel.json`

**Interfaces:**
- Consumes: bestehende `vercel.json` mit 2 Cron-Eintraegen.
- Produces: 2 zusaetzliche Cron-Eintraege fuer `/api/cron/tick` und `/api/cron/sync-whatsapp`.

- [ ] **Step 1: vercel.json aktualisieren**

In `vercel.json`, fuege die neuen Crons zum bestehenden Array hinzu:

```json
{
  "regions": ["dub1"],
  "crons": [
    {
      "path": "/api/cron/daily",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/cadence",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/tick",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/cron/sync-whatsapp",
      "schedule": "0 * * * *"
    }
  ]
}
```

- [ ] **Step 2: Vollstaendiger Build + Test-Suite**

Run: `npm run build && npx vitest run`
Expected: Build gruen, alle Tests gruen (bestehende 38 + neue aus Tasks 2, 4, 5).

- [ ] **Step 3: Abnahme-Checkliste durchgehen (Spec §16 Phase 2)**

Manuelle Verifikation (oder simulierter Test):

1. **Webhook POST (simuliert):** Ein POST an `/api/webhooks/whatsapp` mit gueltigem HMAC landet als Event in `events_inbox` mit status `pending`.
2. **Geschlossenes Fenster:** Wenn `window_expires_at` in der Vergangenheit liegt, wird freier Text von `sendWhatsAppMessage()` mit Fehler abgelehnt, aber Vorlage geht durch.
3. **STOP:** Eine eingehende Nachricht "STOP" setzt `candidates.whatsapp_opt_in` auf `false` und blockiert nachfolgende Sends.
4. **Manual Connect:** `/api/whatsapp/manual-connect` mit Admin-Auth + Impersonation speichert den Account verschluesselt und seeded Vorlagen.

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "feat: add tick (1min) and sync-whatsapp (hourly) cron jobs to vercel.json"
```

---

## Deferred (geparkt fuer spaetere Phasen)

Die folgenden Features aus Spec §9 und §7 sind bewusst NICHT in Phase 2 enthalten:

| Feature | Zielphase |
|---|---|
| KI-Antwortvorschlag (Button erzeugt Entwurf) | Phase 3 |
| Web-Push-Benachrichtigungen fuer Inbox | Phase 4 |
| 15-Minuten-E-Mail-Digest fuer Inbox | Phase 4 |
| Praesenzanzeige ("Anna schreibt gerade") | Phase 6 |
| @-Erwaehnung in internen Notizen | Phase 6 |
| Postgres-Volltextsuche ueber Nachrichtentext | Phase 6 |
| Mandantenuebergreifende Admin-Inbox | Phase 6 (Admins nutzen bestehende Impersonation) |
| Dateiupload im Composer (Bild/PDF bis 16 MB) | Phase 3 (mit Media-Upload-Provider-Methode) |
| Assign-Dropdown in Chat-Header | Phase 3 (mit auto-assign Logik) |
| "Bot pausieren/fortsetzen" Toggle | Phase 3 (benoetigt Bot-Zustandsmaschine) |
| Sprachnachrichten-Player mit signed URLs | Phase 4 |
