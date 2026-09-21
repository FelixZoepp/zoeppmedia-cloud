/**
 * Tests für Template-Presets, Status-Mapping und seedTemplatesForAccount.
 * Task 7 Review M1.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TEMPLATE_PRESETS, seedTemplatesForAccount } from '../../whatsapp/template-presets';
import { mapMetaTemplateStatus } from '../../../app/api/cron/sync-whatsapp/route';

// ---------------------------------------------------------------------------
// Mock: @/lib/whatsapp/provider — damit seedTemplatesForAccount keine echten
// Meta-Requests macht.
// ---------------------------------------------------------------------------
vi.mock('@/lib/whatsapp/provider', () => ({
  getProvider: vi.fn(),
}));

// Mock: @/lib/crypto — decryptSecret soll einfach den Wert durchreichen
vi.mock('@/lib/crypto', () => ({
  decryptSecret: vi.fn((v: string) => v),
}));

// ---------------------------------------------------------------------------
// Hilfsfunktion: baut einen chainbaren Supabase-Mock-Client
// ---------------------------------------------------------------------------
function createMockSvc(overrides?: {
  upsertImpl?: (data: Record<string, unknown>) => { data: unknown; error: unknown };
}) {
  const upsertCalls: Array<Record<string, unknown>> = [];

  function buildChain(resolvedValue: { data: unknown; error: unknown }) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnValue(resolvedValue),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };
    return chain;
  }

  const svc = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'whatsapp_accounts') {
        // Gibt einen gültigen Account zurück
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockReturnValue({
            data: { waba_id: 'waba-1', access_token_enc: 'enc-token' },
            error: null,
          }),
        };
      }
      if (table === 'whatsapp_templates') {
        return {
          upsert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            upsertCalls.push(data);
            const resolved = overrides?.upsertImpl
              ? overrides.upsertImpl(data)
              : { data: { id: `tmpl-${upsertCalls.length}` }, error: null };
            return buildChain(resolved);
          }),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
      }
      // Fallback
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: null, error: null }),
        upsert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      };
    }),
    _upsertCalls: upsertCalls,
  };

  return svc;
}

// ---------------------------------------------------------------------------
// 1. TEMPLATE_PRESETS — statische Validierung
// ---------------------------------------------------------------------------
describe('TEMPLATE_PRESETS', () => {
  it('hat genau 10 Einträge', () => {
    expect(TEMPLATE_PRESETS).toHaveLength(10);
  });

  it('alle preset_keys sind eindeutig', () => {
    const keys = TEMPLATE_PRESETS.map((p) => p.presetKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('mindestens ein Preset-Body enthält deutschen Umlaut (ä/ö/ü/ß)', () => {
    const hasUmlaut = TEMPLATE_PRESETS.some((p) => /[äöüÄÖÜß]/.test(p.body));
    expect(hasUmlaut).toBe(true);
  });

  it('alle Presets haben category UTILITY und language de', () => {
    for (const preset of TEMPLATE_PRESETS) {
      expect(preset.category).toBe('UTILITY');
      expect(preset.language).toBe('de');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. mapMetaTemplateStatus — Status-Mapping
// ---------------------------------------------------------------------------
describe('mapMetaTemplateStatus', () => {
  it("'APPROVED' → 'approved'", () => {
    expect(mapMetaTemplateStatus('APPROVED')).toBe('approved');
  });

  it("'REJECTED' → 'rejected'", () => {
    expect(mapMetaTemplateStatus('REJECTED')).toBe('rejected');
  });

  it("'PENDING_DELETION' → 'deleted'", () => {
    expect(mapMetaTemplateStatus('PENDING_DELETION')).toBe('deleted');
  });

  it("'IN_APPEAL' → 'pending'", () => {
    expect(mapMetaTemplateStatus('IN_APPEAL')).toBe('pending');
  });

  it("'LIMIT_EXCEEDED' → 'pending'", () => {
    expect(mapMetaTemplateStatus('LIMIT_EXCEEDED')).toBe('pending');
  });

  it("'paused' (Kleinschreibung) → 'paused'", () => {
    expect(mapMetaTemplateStatus('paused')).toBe('paused');
  });

  it("'deleted' → 'deleted'", () => {
    expect(mapMetaTemplateStatus('deleted')).toBe('deleted');
  });

  it("'pending' → 'pending'", () => {
    expect(mapMetaTemplateStatus('pending')).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// 3. seedTemplatesForAccount — Verhalten mit Mock
// ---------------------------------------------------------------------------
describe('seedTemplatesForAccount', () => {
  const AGENCY_ID = 'agency-abc';
  const WA_ACCOUNT_ID = 'wa-account-xyz';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ruft upsert genau 10-mal auf (einmal pro Preset)', async () => {
    const { getProvider } = await import('@/lib/whatsapp/provider');
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      createTemplate: vi.fn().mockResolvedValue({ id: 'meta-tmpl-1' }),
    });

    const svc = createMockSvc();
    await seedTemplatesForAccount(svc as never, WA_ACCOUNT_ID, AGENCY_ID);

    expect(svc._upsertCalls).toHaveLength(10);
  });

  it('jedes upsert-Payload enthält agency_id', async () => {
    const { getProvider } = await import('@/lib/whatsapp/provider');
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      createTemplate: vi.fn().mockResolvedValue({ id: 'meta-tmpl-1' }),
    });

    const svc = createMockSvc();
    await seedTemplatesForAccount(svc as never, WA_ACCOUNT_ID, AGENCY_ID);

    for (const call of svc._upsertCalls) {
      expect(call.agency_id).toBe(AGENCY_ID);
    }
  });

  it('createTemplate-Fehler bei Preset 3 verhindert nicht Presets 4–10', async () => {
    const { getProvider } = await import('@/lib/whatsapp/provider');
    let callCount = 0;
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      createTemplate: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 3) {
          return Promise.reject(new Error('Meta-API Rate-Limit'));
        }
        return Promise.resolve({ id: `meta-tmpl-${callCount}` });
      }),
    });

    const svc = createMockSvc();
    // Sollte nicht werfen
    await expect(
      seedTemplatesForAccount(svc as never, WA_ACCOUNT_ID, AGENCY_ID)
    ).resolves.toBeUndefined();

    // Alle 10 Upserts wurden trotzdem aufgerufen
    expect(svc._upsertCalls).toHaveLength(10);
  });

  it('insertError bei Preset 3 führt zu console.warn und überspringt Preset, Presets 4–10 laufen durch', async () => {
    const { getProvider } = await import('@/lib/whatsapp/provider');
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      createTemplate: vi.fn().mockResolvedValue({ id: 'meta-tmpl-1' }),
    });

    let upsertCount = 0;
    const svc = createMockSvc({
      upsertImpl: () => {
        upsertCount++;
        if (upsertCount === 3) {
          return { data: null, error: { message: 'unique constraint violated' } };
        }
        return { data: { id: `tmpl-${upsertCount}` }, error: null };
      },
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await seedTemplatesForAccount(svc as never, WA_ACCOUNT_ID, AGENCY_ID);

    // Alle 10 upserts wurden versucht
    expect(svc._upsertCalls).toHaveLength(10);
    expect(warnSpy).toHaveBeenCalledWith(
      'Template-Seed: Insert fehlgeschlagen',
      'unique constraint violated'
    );

    warnSpy.mockRestore();
  });
});
